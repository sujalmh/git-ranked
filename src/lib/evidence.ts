import type { RawEvent } from './scoring';
import {
  asNumber,
  asPayload,
  titleFromPayload,
  eventDate,
} from './contributor-insights';

export type EvidenceKind = 'pr' | 'commit' | 'review' | 'issue' | 'release';

export type EvidenceItem = {
  id: string;
  kind: EvidenceKind;
  title: string;
  actor: string;
  date: string;
  prNumber?: number;
  additions?: number;
  deletions?: number;
};

export type HealthMetricKey =
  | 'delivery'
  | 'collaboration'
  | 'codeQuality'
  | 'reviewHealth'
  | 'knowledgeDistribution';

export type MetricEvidence = {
  key: HealthMetricKey;
  label: string;
  score: number;
  blurb: string;
  signals: { label: string; value: string }[];
  items: EvidenceItem[];
};

const PR_REF = /#(\d{1,6})/g;

function kindFor(type: string): EvidenceKind {
  if (type.startsWith('pr_')) return 'pr';
  if (type === 'push') return 'commit';
  if (type === 'review_submitted') return 'review';
  if (type.startsWith('issue_')) return 'issue';
  if (type === 'release') return 'release';
  return 'commit';
}

function prNumberOf(payload: Record<string, unknown>): number | undefined {
  const n = asNumber(payload.number) || asNumber(payload.pr_number);
  return n > 0 ? n : undefined;
}

export function toEvidenceItem(event: RawEvent, actor = 'contributor'): EvidenceItem | null {
  const payload = asPayload(event.payload);
  const type = event.event_type || event.type || '';
  const title = titleFromPayload(type, payload) || type;
  const prNumber = prNumberOf(payload);
  const additions = asNumber(payload.additions) || undefined;
  const deletions = asNumber(payload.deletions) || undefined;
  return {
    id: `ev-${event.id ?? `${type}-${event.created_at}-${actor}`}`,
    kind: kindFor(type),
    title,
    actor,
    date: eventDate(event.created_at).toISOString(),
    prNumber,
    additions: additions && additions > 0 ? additions : undefined,
    deletions: deletions && deletions > 0 ? deletions : undefined,
  };
}

export function buildEvidencePool(
  contributors: { username: string; events: RawEvent[] }[]
): EvidenceItem[] {
  const seen = new Set<string>();
  const pool: EvidenceItem[] = [];
  for (const c of contributors) {
    for (const ev of c.events) {
      const item = toEvidenceItem(ev, c.username);
      if (!item) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      pool.push(item);
    }
  }
  pool.sort((a, b) => b.date.localeCompare(a.date));
  return pool;
}

export function findEvidence(
  insight: string,
  pool: EvidenceItem[],
  knownUsernames: string[] = []
): EvidenceItem[] {
  if (!insight || pool.length === 0) return [];

  const prNums = new Set<number>();
  for (const m of insight.matchAll(PR_REF)) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n)) prNums.add(n);
  }

  const users = new Set<string>();
  for (const u of knownUsernames) {
    if (u && insight.toLowerCase().includes(u.toLowerCase())) users.add(u.toLowerCase());
  }

  if (prNums.size > 0 || users.size > 0) {
    return pool
      .filter((item) => {
        const byPr = item.prNumber !== undefined && prNums.has(item.prNumber);
        const byUser = users.size > 0 && users.has(item.actor.toLowerCase());
        return byPr || byUser;
      })
      .slice(0, 12);
  }

  const tokens = insight
    .toLowerCase()
    .replace(/[^a-z0-9\s+#/-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 3 && !['that', 'this', 'with', 'from', 'have', 'been', 'their', 'there', 'which', 'should', 'would', 'could', 'areas', 'module', 'modules'].includes(t));

  if (tokens.length === 0) return [];

  const scored = pool
    .map((item) => {
      const hay = `${item.title} ${item.actor}`.toLowerCase();
      const hits = tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
      return { item, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  return scored.slice(0, 8).map((s) => s.item);
}

export function metricEvidence(
  key: HealthMetricKey,
  score: number,
  pool: EvidenceItem[]
): MetricEvidence {
  const prsMerged = pool.filter((e) => e.kind === 'pr').length;
  const pushes = pool.filter((e) => e.kind === 'commit').length;
  const reviews = pool.filter((e) => e.kind === 'review').length;
  const issues = pool.filter((e) => e.kind === 'issue').length;
  const releases = pool.filter((e) => e.kind === 'release').length;
  const fixItems = pool.filter((e) => /\b(fix|bug|error|refactor|perf|harden)\b/i.test(e.title));
  const actorCounts = new Map<string, number>();
  for (const e of pool) actorCounts.set(e.actor, (actorCounts.get(e.actor) ?? 0) + 1);
  const activeContributors = actorCounts.size;
  const maxShare = Math.max(0, ...Array.from(actorCounts.values()));
  const totalEvents = pool.length;
  const busFactor = totalEvents > 0 ? maxShare / totalEvents : 1;

  const base: Record<HealthMetricKey, Omit<MetricEvidence, 'items'>> = {
    delivery: {
      key: 'delivery',
      label: 'Delivery',
      score,
      blurb: 'Driven by merged PRs and opened PRs over the last 30 days.',
      signals: [
        { label: 'PRs merged', value: String(prsMerged) },
        { label: 'Pushes', value: String(pushes) },
        { label: 'Releases', value: String(releases) },
      ],
    },
    collaboration: {
      key: 'collaboration',
      label: 'Collaboration',
      score,
      blurb: 'Issues touched and reviews submitted reflect how the team coordinates.',
      signals: [
        { label: 'Issues', value: String(issues) },
        { label: 'Reviews', value: String(reviews) },
      ],
    },
    codeQuality: {
      key: 'codeQuality',
      label: 'Code Quality',
      score,
      blurb: 'A healthy fix-to-feature ratio signals sustainable quality work.',
      signals: [
        { label: 'Fix / refactor signals', value: String(fixItems.length) },
        { label: 'Total shipped', value: String(prsMerged + pushes) },
      ],
    },
    reviewHealth: {
      key: 'reviewHealth',
      label: 'Review Health',
      score,
      blurb: 'Reviews per merged PR. ~2 reviews per PR scores 100.',
      signals: [
        { label: 'Reviews', value: String(reviews) },
        { label: 'Merged PRs', value: String(prsMerged) },
        { label: 'Reviews / PR', value: prsMerged > 0 ? (reviews / prsMerged).toFixed(1) : '0' },
      ],
    },
    knowledgeDistribution: {
      key: 'knowledgeDistribution',
      label: 'Knowledge Distribution',
      score,
      blurb: 'Even activity spread lowers the bus factor and concentration risk.',
      signals: [
        { label: 'Active contributors', value: String(activeContributors) },
        { label: 'Bus factor', value: `${Math.round(busFactor * 100)}%` },
      ],
    },
  };

  const itemsByKind: Record<HealthMetricKey, EvidenceItem[]> = {
    delivery: pool.filter((e) => e.kind === 'pr' || e.kind === 'release').slice(0, 8),
    collaboration: pool.filter((e) => e.kind === 'issue' || e.kind === 'review').slice(0, 8),
    codeQuality: fixItems.slice(0, 8),
    reviewHealth: pool.filter((e) => e.kind === 'review').slice(0, 8),
    knowledgeDistribution: pool.slice(0, 8),
  };

  return { ...base[key], items: itemsByKind[key] };
}

import { sql } from '../db';
import {
  asNumber,
  asPayload,
  describeEvent,
  eventCategory,
  eventDate,
  titleFromPayload,
} from '../contributor-insights';
import type { Classification, ClassificationItem, DiffFacts, NormalizedEvent, TaskContext } from './types';
import { getDiffFacts } from './diff-facts';

export type EventRow = {
  id: number;
  event_type: string;
  payload: unknown;
  created_at: Date | string;
  contributor_id: number;
  username: string;
  classification?: unknown;
  classified_at?: Date | string | null;
  diff_facts?: unknown;
};

export async function fetchEvents(
  repoId: number,
  dateFrom: string,
  dateTo: string,
  contributorId?: number
): Promise<EventRow[]> {
  const rows = contributorId
    ? await sql`
        SELECT e.id, e.event_type, e.payload, e.created_at, e.contributor_id,
               c.username, e.classification, e.classified_at, e.diff_facts
        FROM github_events e
        JOIN github_contributors c ON e.contributor_id = c.id
        WHERE e.repo_id = ${repoId}
          AND e.contributor_id = ${contributorId}
          AND e.created_at >= ${dateFrom}::date
          AND e.created_at < ${dateTo}::date + INTERVAL '1 day'
        ORDER BY e.created_at ASC
      `
    : await sql`
        SELECT e.id, e.event_type, e.payload, e.created_at, e.contributor_id,
               c.username, e.classification, e.classified_at, e.diff_facts
        FROM github_events e
        JOIN github_contributors c ON e.contributor_id = c.id
        WHERE e.repo_id = ${repoId}
          AND e.created_at >= ${dateFrom}::date
          AND e.created_at < ${dateTo}::date + INTERVAL '1 day'
        ORDER BY e.created_at ASC
      `;

  return rows as EventRow[];
}

export async function normalizeEvents(
  repoId: number,
  repoOwner: string,
  repoName: string,
  rows: EventRow[],
  fetchDiffs = true
): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];

  for (const row of rows) {
    const payload = asPayload(row.payload);
    const createdAt = eventDate(row.created_at);
    const title = titleFromPayload(row.event_type, payload);
    const category = eventCategory(row.event_type, payload);

    let diffFacts: DiffFacts | undefined;
    if (fetchDiffs && (row.event_type === 'pr_merged' || row.event_type === 'pr_opened')) {
      diffFacts = await getDiffFacts({
        eventId: row.id,
        repoOwner,
        repoName,
        repoId,
        prNumber: asNumber(payload.pr_number),
        storedFacts: row.diff_facts,
      }).catch(() => undefined);
    } else if (row.diff_facts && typeof row.diff_facts === 'object') {
      diffFacts = row.diff_facts as DiffFacts;
    }

    const classification = parseClassification(row.classification);

    events.push({
      id: row.id,
      type: row.event_type,
      username: row.username,
      createdAt: createdAt.toISOString(),
      title,
      description: describeEvent(row.event_type, payload),
      category,
      prNumber: asNumber(payload.pr_number) || undefined,
      additions: typeof payload.additions === 'number' ? payload.additions : undefined,
      deletions: typeof payload.deletions === 'number' ? payload.deletions : undefined,
      changedFiles: typeof payload.changed_files === 'number' ? payload.changed_files : undefined,
      diffFacts,
      classification,
    });
  }

  return events;
}

export function parseClassification(raw: unknown): ClassificationItem | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const items = Array.isArray(obj.items) ? obj.items : null;
  if (items) return undefined;
  try {
    return obj as unknown as ClassificationItem;
  } catch {
    return undefined;
  }
}

export function buildEventContextBlock(events: NormalizedEvent[], maxEvents = 60): string {
  const limited = events.slice(-maxEvents);
  return limited
    .map((e) => {
      const parts: string[] = [
        `[${e.createdAt}] ${e.username} - ${e.type}: ${e.title}`,
      ];
      if (e.additions !== undefined || e.deletions !== undefined) {
        parts.push(`  lines: +${e.additions ?? 0} / -${e.deletions ?? 0}, files: ${e.changedFiles ?? 0}`);
      }
      if (e.diffFacts) {
        const df = e.diffFacts;
        const facts: string[] = [];
        if (df.files_changed) facts.push(`${df.files_changed} files`);
        if (df.languages.length) facts.push(`langs: ${df.languages.join(', ')}`);
        if (df.directories.length) facts.push(`dirs: ${df.directories.slice(0, 5).join(', ')}`);
        if (df.dependency_updates.length) facts.push(`deps: ${df.dependency_updates.join(', ')}`);
        if (df.tests_added) facts.push(`${df.tests_added} test files`);
        if (df.migrations) facts.push(`${df.migrations} migrations`);
        if (df.docs_updated) facts.push(`${df.docs_updated} docs`);
        if (facts.length) parts.push(`  diff facts: ${facts.join('; ')}`);
      }
      if (e.classification) {
        parts.push(`  classified: ${e.classification.work_type} (${Math.round(e.classification.confidence * 100)}%)`);
      }
      return parts.join('\n');
    })
    .join('\n');
}

export function buildContributorStatsBlock(stats: TaskContext['contributorStats']): string {
  if (!stats) return '';
  return [
    `Commits: ${stats.commits}`,
    `PRs opened: ${stats.prsOpened}`,
    `PRs merged: ${stats.prsMerged}`,
    `Reviews: ${stats.reviews}`,
    `Issues: ${stats.issues}`,
    `Releases: ${stats.releases}`,
    `Fixes: ${stats.fixes}`,
    `Changed lines: ${stats.changedLines}`,
    `Active days: ${stats.activeDays}`,
  ].join('\n');
}

export function buildClassificationRollup(events: NormalizedEvent[]): string {
  const rollup = new Map<string, number>();
  for (const e of events) {
    const wt = e.classification?.work_type ?? e.category;
    rollup.set(wt, (rollup.get(wt) ?? 0) + 1);
  }
  return Array.from(rollup.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');
}

export function computeContributorStats(events: NormalizedEvent[]) {
  let commits = 0;
  let prsOpened = 0;
  let prsMerged = 0;
  let reviews = 0;
  let issues = 0;
  let releases = 0;
  let fixes = 0;
  let changedLines = 0;
  const activeDays = new Set<string>();

  for (const e of events) {
    activeDays.add(e.createdAt.split('T')[0]);
    if (e.type === 'push') commits += 1;
    if (e.type === 'pr_opened') prsOpened += 1;
    if (e.type === 'pr_merged') {
      prsMerged += 1;
      changedLines += (e.additions ?? 0) + (e.deletions ?? 0);
    }
    if (e.type === 'review_submitted') reviews += 1;
    if (e.type.startsWith('issue_')) issues += 1;
    if (e.type === 'release') releases += 1;
    if (e.classification?.work_type === 'Bug Fix' || e.classification?.categories.includes('Reliability')) {
      fixes += 1;
    }
  }

  return { commits, prsOpened, prsMerged, reviews, issues, releases, fixes, changedLines, activeDays: activeDays.size };
}

export type { Classification };

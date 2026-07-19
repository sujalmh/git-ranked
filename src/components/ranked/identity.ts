import type { ContributorInsight, ContributionCategory } from '@/lib/contributor-insights';

export const SMALL_TEAM_THRESHOLD = 5;

export function isSmallTeam(count: number): boolean {
  return count > 0 && count <= SMALL_TEAM_THRESHOLD;
}

export type PodiumTier = 'gold' | 'silver' | 'bronze';

export type PodiumStyle = {
  tier: PodiumTier;
  text: string;
  chip: string;
  ring: string;
  border: string;
  glow: string;
  dot: string;
};

export const PODIUM: Record<PodiumTier, PodiumStyle> = {
  gold: {
    tier: 'gold',
    text: 'text-amber-300',
    chip: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
    ring: 'ring-2 ring-amber-500/50',
    border: 'border-amber-500/40',
    glow: 'bg-amber-500/10',
    dot: 'bg-amber-400',
  },
  silver: {
    tier: 'silver',
    text: 'text-zinc-200',
    chip: 'bg-zinc-400/15 border-zinc-400/30 text-zinc-200',
    ring: 'ring-2 ring-zinc-400/40',
    border: 'border-zinc-400/30',
    glow: 'bg-zinc-400/10',
    dot: 'bg-zinc-300',
  },
  bronze: {
    tier: 'bronze',
    text: 'text-orange-400',
    chip: 'bg-orange-600/15 border-orange-600/30 text-orange-400',
    ring: 'ring-2 ring-orange-600/40',
    border: 'border-orange-600/30',
    glow: 'bg-orange-600/10',
    dot: 'bg-orange-500',
  },
};

export function podiumStyleForRank(rank: number): PodiumStyle | null {
  if (rank === 1) return PODIUM.gold;
  if (rank === 2) return PODIUM.silver;
  if (rank === 3) return PODIUM.bronze;
  return null;
}

export type Severity = 'risk' | 'warning' | 'info';

export type SeverityStyle = {
  severity: Severity;
  text: string;
  border: string;
  chip: string;
  dot: string;
  label: string;
};

export const SEVERITY: Record<Severity, SeverityStyle> = {
  risk: {
    severity: 'risk',
    text: 'text-red-300',
    border: 'border-l-red-500',
    chip: 'bg-red-500/10 border-red-500/20 text-red-300',
    dot: 'bg-red-500',
    label: 'Risk',
  },
  warning: {
    severity: 'warning',
    text: 'text-amber-300',
    border: 'border-l-amber-500',
    chip: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
    dot: 'bg-amber-500',
    label: 'Bottleneck',
  },
  info: {
    severity: 'info',
    text: 'text-zinc-300',
    border: 'border-l-zinc-500',
    chip: 'bg-zinc-500/10 border-zinc-500/20 text-zinc-300',
    dot: 'bg-zinc-500',
    label: 'Info',
  },
};

const IDENTITY_PALETTE = [
  { ring: 'ring-indigo-400/70', border: 'border-indigo-400/50', dot: 'bg-indigo-400', hex: '#818cf8' },
  { ring: 'ring-sky-400/70', border: 'border-sky-400/50', dot: 'bg-sky-400', hex: '#38bdf8' },
  { ring: 'ring-violet-400/70', border: 'border-violet-400/50', dot: 'bg-violet-400', hex: '#a78bfa' },
  { ring: 'ring-cyan-400/70', border: 'border-cyan-400/50', dot: 'bg-cyan-400', hex: '#22d3ee' },
  { ring: 'ring-fuchsia-400/70', border: 'border-fuchsia-400/50', dot: 'bg-fuchsia-400', hex: '#e879f9' },
];

export type IdentityColor = {
  ring: string;
  border: string;
  dot: string;
  hex: string;
};

export const NEUTRAL_IDENTITY: IdentityColor = {
  ring: 'ring-white/15',
  border: 'border-white/10',
  dot: 'bg-zinc-500',
  hex: '#71717a',
};

export type IdentityAssignment = {
  colorByUserId: Map<number, IdentityColor>;
  hexByUsername: Map<string, string>;
  smallTeam: boolean;
};

export function assignIdentity(contributors: ContributorInsight[]): IdentityAssignment {
  const smallTeam = isSmallTeam(contributors.length);
  const colorByUserId = new Map<number, IdentityColor>();
  const hexByUsername = new Map<string, string>();

  if (!smallTeam) {
    return { colorByUserId, hexByUsername, smallTeam };
  }

  const ranked = [...contributors].sort((a, b) => b.impactScore - a.impactScore);
  ranked.forEach((c, idx) => {
    const palette = IDENTITY_PALETTE[idx % IDENTITY_PALETTE.length];
    colorByUserId.set(c.id, palette);
    if (c.username) hexByUsername.set(c.username, palette.hex);
  });

  return { colorByUserId, hexByUsername, smallTeam };
}

export function identityFor(assignment: IdentityAssignment, userId: number): IdentityColor {
  return assignment.colorByUserId.get(userId) ?? NEUTRAL_IDENTITY;
}

export type BreakdownSegment = {
  key: string;
  label: string;
  value: number;
  className: string;
};

const BREAKDOWN_SEGMENTS: Array<Omit<BreakdownSegment, 'value'>> = [
  { key: 'featureDelivery', label: 'Shipping', className: 'bg-indigo-500' },
  { key: 'codeQuality', label: 'Quality', className: 'bg-violet-500' },
  { key: 'reviews', label: 'Reviews', className: 'bg-sky-500' },
  { key: 'collaboration', label: 'Collab', className: 'bg-cyan-500' },
  { key: 'consistency', label: 'Consistency', className: 'bg-slate-500' },
];

export function breakdownSegments(contributor: ContributorInsight): BreakdownSegment[] {
  const b = contributor.score.breakdown;
  const segments = BREAKDOWN_SEGMENTS.map((s) => ({
    ...s,
    value: b[s.key as keyof typeof b] ?? 0,
  }));
  return segments.filter((s) => s.value > 0);
}

const TOPIC_COLORS: Record<string, string> = {
  'Feature Work': 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  'Code Review': 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  'Reliability': 'text-teal-300 bg-teal-500/10 border-teal-500/20',
  'Releases': 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  'Planning': 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20',
  'Maintenance': 'text-zinc-300 bg-zinc-500/10 border-zinc-500/20',
};

export const TOPIC_NEUTRAL = 'text-zinc-300 bg-white/5 border-white/10';

export function topicChipClass(label: string): string {
  return TOPIC_COLORS[label] ?? TOPIC_NEUTRAL;
}

export type PrimaryArea = { label: string; generalist: boolean };

export function primaryWorkArea(contributor: ContributorInsight): PrimaryArea {
  const categories: ContributionCategory[] = contributor.categories ?? [];
  if (categories.length === 0) {
    const dist = Object.entries(contributor.workDistribution ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (dist.length === 0) return { label: 'Generalist', generalist: true };
    const total = dist.reduce((sum, [, v]) => sum + v, 0);
    const top = dist[0];
    if (total > 0 && top[1] / total >= 0.45) return { label: top[0], generalist: false };
    return { label: 'Generalist', generalist: true };
  }
  const total = categories.reduce((sum, c) => sum + c.value, 0);
  if (total === 0) return { label: 'Generalist', generalist: true };
  const sorted = [...categories].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const second = sorted[1];
  const topShare = top.value / total;
  const dominant = second ? top.value >= second.value * 1.6 : topShare >= 0.4;
  if (dominant && topShare >= 0.35) return { label: top.label, generalist: false };
  return { label: 'Generalist', generalist: true };
}

export type RankDelta = {
  delta: number;
  previousRank: number | null;
  isNew: boolean;
};

export type RankDeltaMap = Map<number, RankDelta>;

export type VelocityMomentum = {
  userId: number;
  username: string;
  delta: number;
  current: number;
};

export function velocityMomentum(contributors: ContributorInsight[]): VelocityMomentum[] {
  return contributors
    .map((c) => {
      const v = c.velocity ?? [];
      const current = v[v.length - 1] ?? 0;
      const previous = v.length > 1 ? v[v.length - 2] ?? 0 : 0;
      return {
        userId: c.id,
        username: c.username,
        current,
        delta: current - previous,
      };
    })
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta);
}

export type RisingEntry = {
  userId: number;
  username: string;
  avatarUrl: string | null;
  impactScore: number;
  reason: string;
  delta: number;
};;

export type StatKey = 'commits' | 'prsOpened' | 'prsMerged' | 'reviews' | 'issues' | 'fixes';

const STAT_KEYWORDS: Array<{ key: StatKey; pattern: RegExp }> = [
  { key: 'reviews', pattern: /\breview/i },
  { key: 'commits', pattern: /\bcommit|push/i },
  { key: 'prsOpened', pattern: /\bpr\b|pull request/i },
  { key: 'issues', pattern: /\bissue/i },
  { key: 'fixes', pattern: /\bfix|bug/i },
];

function statValue(contributor: ContributorInsight, key: StatKey): number {
  switch (key) {
    case 'commits': return contributor.commits;
    case 'prsOpened': return contributor.prsOpened;
    case 'prsMerged': return contributor.prsMerged;
    case 'reviews': return contributor.reviews;
    case 'issues': return contributor.issues;
    case 'fixes': return contributor.fixes;
  }
}

export function computeRiskHighlights(
  contributors: ContributorInsight[],
  findingTexts: string[],
): Map<number, Set<StatKey>> {
  const out = new Map<number, Set<StatKey>>();
  if (findingTexts.length === 0 || contributors.length === 0) return out;
  for (const c of contributors) {
    if (!c.username) continue;
    const lowerName = c.username.toLowerCase();
    const matching = findingTexts.filter((t) => t.toLowerCase().includes(lowerName));
    if (matching.length === 0) continue;
    const hits = new Set<StatKey>();
    for (const { key, pattern } of STAT_KEYWORDS) {
      if (statValue(c, key) === 0 && matching.some((t) => pattern.test(t))) {
        hits.add(key);
      }
    }
    if (hits.size > 0) out.set(c.id, hits);
  }
  return out;
}

export function buildRising(
  contributors: ContributorInsight[],
  rankDeltas: RankDeltaMap | null,
  limit = 3,
): RisingEntry[] {
  if (rankDeltas && rankDeltas.size > 0) {
    return contributors
      .map((c) => {
        const d = rankDeltas.get(c.id);
        if (!d || d.delta >= 0) return null;
        return {
          userId: c.id,
          username: c.username,
          avatarUrl: c.avatarUrl,
          impactScore: c.impactScore,
          reason: d.isNew ? 'New on the board' : `Up ${Math.abs(d.delta)} from #${d.previousRank}`,
          delta: d.delta,
        } as RisingEntry;
      })
      .filter((e): e is RisingEntry => e !== null)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, limit);
  }

  return velocityMomentum(contributors)
    .slice(0, limit)
    .map((m) => {
      const c = contributors.find((x) => x.id === m.userId);
      return {
        userId: m.userId,
        username: m.username,
        avatarUrl: c?.avatarUrl ?? null,
        impactScore: c?.impactScore ?? 0,
        reason: `+${m.delta} events vs last week`,
        delta: m.delta,
      } as RisingEntry;
    });
}

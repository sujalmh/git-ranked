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
    text: 'text-[#ccff00]',
    chip: 'bg-[#ccff00] border-[#ccff00] text-black font-bold',
    ring: 'ring-4 ring-[#ccff00]',
    border: 'border-[#ccff00]',
    glow: 'shadow-[8px_8px_0_0_#ccff00]',
    dot: 'bg-[#ccff00]',
  },
  silver: {
    tier: 'silver',
    text: 'text-white',
    chip: 'bg-white border-white text-black font-bold',
    ring: 'ring-4 ring-white',
    border: 'border-white',
    glow: 'shadow-[8px_8px_0_0_#ffffff]',
    dot: 'bg-white',
  },
  bronze: {
    tier: 'bronze',
    text: 'text-zinc-400',
    chip: 'bg-zinc-800 border-zinc-600 text-white font-bold',
    ring: 'ring-4 ring-zinc-500',
    border: 'border-zinc-500',
    glow: 'shadow-[8px_8px_0_0_#71717a]',
    dot: 'bg-zinc-500',
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
  { ring: 'ring-[#ccff00]', border: 'border-[#ccff00]', dot: 'bg-[#ccff00]', hex: '#ccff00' },
  { ring: 'ring-[#00ffff]', border: 'border-[#00ffff]', dot: 'bg-[#00ffff]', hex: '#00ffff' },
  { ring: 'ring-[#ff00ff]', border: 'border-[#ff00ff]', dot: 'bg-[#ff00ff]', hex: '#ff00ff' },
  { ring: 'ring-[#ff5500]', border: 'border-[#ff5500]', dot: 'bg-[#ff5500]', hex: '#ff5500' },
  { ring: 'ring-[#00ff66]', border: 'border-[#00ff66]', dot: 'bg-[#00ff66]', hex: '#00ff66' },
];

export type IdentityColor = {
  ring: string;
  border: string;
  dot: string;
  hex: string;
};

export const NEUTRAL_IDENTITY: IdentityColor = {
  ring: 'ring-white',
  border: 'border-white',
  dot: 'bg-white',
  hex: '#ffffff',
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
  { key: 'featureDelivery', label: 'Shipping', className: 'bg-[#ccff00]' },
  { key: 'codeQuality', label: 'Quality', className: 'bg-[#00ffff]' },
  { key: 'reviews', label: 'Reviews', className: 'bg-[#ff00ff]' },
  { key: 'collaboration', label: 'Collab', className: 'bg-[#ff5500]' },
  { key: 'consistency', label: 'Consistency', className: 'bg-[#00ff66]' },
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
  'Feature Work': 'text-black bg-[#ccff00] border-[#ccff00]',
  'Code Review': 'text-black bg-[#00ffff] border-[#00ffff]',
  'Reliability': 'text-black bg-[#00ff66] border-[#00ff66]',
  'Releases': 'text-white bg-[#ff5500] border-[#ff5500]',
  'Planning': 'text-black bg-[#ff00ff] border-[#ff00ff]',
  'Maintenance': 'text-black bg-white border-white',
};

export const TOPIC_NEUTRAL = 'text-white bg-zinc-800 border-zinc-700';

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

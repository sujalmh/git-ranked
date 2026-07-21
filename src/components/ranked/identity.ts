import type { ContributorInsight, ContributionCategory } from '@/lib/contributor-insights';

export const SMALL_TEAM_THRESHOLD = 5;

export function isSmallTeam(count: number): boolean {
  return false;
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
    text: 'text-[#ffd700]',
    chip: 'bg-[#ffd700]/10 border-[#ffd700]/30 text-[#ffd700]',
    ring: 'ring-2 ring-[#ffd700]/60',
    border: 'border-[#ffd700]',
    glow: 'bg-[#ffd700]/10',
    dot: 'bg-[#ffd700]',
  },
  silver: {
    tier: 'silver',
    text: 'text-[#c0c0c0]',
    chip: 'bg-[#c0c0c0]/10 border-[#c0c0c0]/30 text-[#c0c0c0]',
    ring: 'ring-2 ring-[#c0c0c0]/60',
    border: 'border-[#c0c0c0]',
    glow: 'bg-[#c0c0c0]/10',
    dot: 'bg-[#c0c0c0]',
  },
  bronze: {
    tier: 'bronze',
    text: 'text-[#cd7f32]',
    chip: 'bg-[#cd7f32]/10 border-[#cd7f32]/30 text-[#cd7f32]',
    ring: 'ring-2 ring-[#cd7f32]/60',
    border: 'border-[#cd7f32]',
    glow: 'bg-[#cd7f32]/10',
    dot: 'bg-[#cd7f32]',
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
    text: 'text-[#00ff66]',
    border: 'border-l-[#00ff66]',
    chip: 'bg-[#00ff66]/10 border-[#00ff66]/20 text-[#00ff66]',
    dot: 'bg-[#00ff66]',
    label: 'Healthy',
  },
};

const IDENTITY_PALETTE = [
  { ring: 'ring-[#ccff00]', border: 'border-[#ccff00]/30', dot: 'bg-[#ccff00]', hex: '#ccff00' },
  { ring: 'ring-[#00ffff]', border: 'border-[#00ffff]/30', dot: 'bg-[#00ffff]', hex: '#00ffff' },
  { ring: 'ring-[#ff00ff]', border: 'border-[#ff00ff]/30', dot: 'bg-[#ff00ff]', hex: '#ff00ff' },
  { ring: 'ring-[#ff5500]', border: 'border-[#ff5500]/30', dot: 'bg-[#ff5500]', hex: '#ff5500' },
  { ring: 'ring-[#00ff66]', border: 'border-[#00ff66]/30', dot: 'bg-[#00ff66]', hex: '#00ff66' },
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

export function randomNeonHex(seed: string): string {
  const colors = [
    '#ff0055', '#ffaa00', '#ccff00', '#00ff66', '#00ffff', 
    '#00bbff', '#9900ff', '#ff00aa', '#ff3300', '#33ff00', 
    '#ff00ff', '#00ffcc', '#ffcc00'
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

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

const TOPIC_PALETTE = [
  'text-sky-300 bg-sky-500/10 border-sky-500/20',
  'text-pink-300 bg-pink-500/10 border-pink-500/20',
  'text-violet-300 bg-violet-500/10 border-violet-500/20',
  'text-amber-300 bg-amber-500/10 border-amber-500/20',
  'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20',
  'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  'text-orange-300 bg-orange-500/10 border-orange-500/20',
  'text-blue-300 bg-blue-500/10 border-blue-500/20',
  'text-teal-300 bg-teal-500/10 border-teal-500/20',
  'text-rose-300 bg-rose-500/10 border-rose-500/20',
];

export const TOPIC_NEUTRAL = 'text-zinc-300 bg-zinc-500/10 border-zinc-500/20';

export function topicChipClass(label: string): string {
  if (!label) return TOPIC_NEUTRAL;
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  if (label.toLowerCase() === 'other') return TOPIC_NEUTRAL;
  return TOPIC_PALETTE[hash % TOPIC_PALETTE.length];
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

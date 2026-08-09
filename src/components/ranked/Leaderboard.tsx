'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Crown,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import type { ContributorInsight } from '@/lib/contributor-insights';
import {
  identityFor,
  podiumStyleForRank,
  primaryWorkArea,
  topicChipClass,
  buildRising,
  randomNeonHex,
  type IdentityAssignment,
  type RankDeltaMap,
  type RisingEntry,
} from './identity';

type SortKey = 'rank' | 'score' | 'streak' | 'reviews';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'rank', label: 'Rank' },
  { key: 'score', label: 'Impact' },
  { key: 'streak', label: 'Streak' },
  { key: 'reviews', label: 'Reviews' },
];

const INITIAL_CARDS = 8;

/** Stat presentation for the four dimension bars, Pokémon-card style. */
const STATS = [
  { key: 'impact', label: 'Impact', bar: 'bg-accent', text: 'text-accent', glow: '#ccff00' },
  { key: 'quality', label: 'Quality', bar: 'bg-[#00ffff]', text: 'text-[#00ffff]', glow: '#00ffff' },
  { key: 'collab', label: 'Collab', bar: 'bg-[#ff00ff]', text: 'text-[#ff00ff]', glow: '#ff00ff' },
  { key: 'consistency', label: 'Consistency', bar: 'bg-[#00ff66]', text: 'text-[#00ff66]', glow: '#00ff66' },
] as const;

type StatKey = (typeof STATS)[number]['key'];

function Avatar({
  src,
  name,
  size,
  ring,
}: {
  src: string | null;
  name: string;
  size: number;
  ring?: string;
}) {
  const inner = !src ? (
    <div className="rounded-none bg-white/10" style={{ width: size, height: size }} />
  ) : (
    <Image src={src} alt={name} width={size} height={size} className="rounded-none" />
  );
  if (!ring) return <div className="rounded-none border border-white/10">{inner}</div>;
  return <div className={`rounded-none ${ring} ring-offset-1 ring-offset-black p-[2px]`}>{inner}</div>;
}

function RankChange({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400" title="No change vs last period">
        <Minus className="w-3 h-3" />
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400" title={`Up ${delta}`}>
        <TrendingUp className="w-3 h-3" />
        {delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-red-400" title={`Down ${Math.abs(delta)}`}>
      <TrendingDown className="w-3 h-3" />
      {Math.abs(delta)}
    </span>
  );
}

function StreakBadge({ days }: { days: number }) {
  if (days <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-full px-1.5 py-0.5">
      <Flame className="w-3 h-3" />
      {days}d
    </span>
  );
}

function PercentileBadge({ percentile }: { percentile?: number }) {
  if (typeof percentile !== 'number' || !Number.isFinite(percentile)) return null;
  const p = Math.round(percentile);
  const top = 100 - p;
  return (
    <span
      className="inline-flex items-center rounded-full border border-[#ccff00]/40 bg-[#ccff00]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#ccff00]"
      title={`Outranks ${top}% of contributors in this repo (percentile ${p}). Comparable across repos of any size.`}
    >
      p{p}
    </span>
  );
}

function deltaFor(rankDeltas: RankDeltaMap | null, userId: number, rank: number): number | null {
  if (!rankDeltas) return null;
  const d = rankDeltas.get(userId);
  if (!d) return null;
  if (d.isNew) return null;
  if (d.previousRank === null) return null;
  return d.previousRank - rank;
}

function StatBar({ statKey, value }: { statKey: StatKey; value: number }) {
  const config = STATS.find((s) => s.key === statKey)!;
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-2" title={`${config.label}: ${v}/100`}>
      <span className={`w-[74px] shrink-0 text-[10px] font-bold uppercase tracking-wider ${config.text}`}>
        {config.label}
      </span>
      <div className="flex-1 h-2 rounded-sm bg-white/5 overflow-hidden">
        <div
          className={`h-full ${config.bar} transition-[width] duration-700 ease-out`}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="w-7 shrink-0 text-right text-sm font-bold text-white tabular-nums">{v}</span>
    </div>
  );
}

/**
 * Pokémon-style trading card: the contributor's four dimensions as stat bars,
 * plus a big TOTAL (composite) — like a card's base-stat total.
 */
function ContributorCard({
  contributor,
  rank,
  assignment,
  rankDeltas,
  repoOwner,
  repoName,
  animate,
}: {
  contributor: ContributorInsight;
  rank: number;
  assignment: IdentityAssignment;
  rankDeltas: RankDeltaMap | null;
  repoOwner: string;
  repoName: string;
  animate: boolean;
}) {
  const identity = identityFor(assignment, contributor.id);
  const delta = deltaFor(rankDeltas, contributor.id, rank);
  const medal = podiumStyleForRank(rank);
  const medalHex = rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : null;
  const glowHex = randomNeonHex(contributor.username);
  const area = primaryWorkArea(contributor);
  const ds = contributor.dimensionScores?.current;
  const statValue = (key: StatKey): number => {
    if (!ds) return 0;
    switch (key) {
      case 'impact': return ds.impact;
      case 'quality': return ds.quality;
      case 'collab': return ds.collaboration;
      case 'consistency': return ds.consistency;
    }
  };
  const total = Math.round(ds?.composite ?? contributor.impactScore ?? 0);
  const ownership = contributor.codeOwnership;
  const totalText = medal?.text ?? (ds && ds.impact > 60 ? 'text-accent' : 'text-white');

  return (
    <Link
      href={`/repos/${repoOwner}/${repoName}/${contributor.username}`}
      className={`relative group flex flex-col rounded-none border-2 bg-black p-4 transition-all duration-300 overflow-hidden shadow-[2px_2px_14px_0_var(--tw-shadow-base)] hover:shadow-[0_0_20px_0_var(--tw-shadow-hover)] hover:-translate-y-0.5 ${
        medal?.border ?? 'border-white/10'
      }`}
      style={{
        opacity: animate ? 1 : 0,
        transform: animate ? 'translateY(0)' : 'translateY(6px)',
        transitionDelay: `${Math.min(rank, 8) * 35}ms`,
        '--tw-shadow-color': medalHex ?? glowHex,
        '--tw-shadow-base': `${medalHex ?? glowHex}22`,
        '--tw-shadow-hover': `${medalHex ?? glowHex}55`,
      } as React.CSSProperties}
    >
      {/* Card header: rank + identity */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-9 h-9 flex items-center justify-center text-lg font-black border ${
              medal
                ? `border-current ${medal.text} bg-white/5`
                : 'border-white/10 text-zinc-500 bg-white/5'
            }`}
          >
            {rank}
          </span>
          {rank === 1 && <Crown className="w-4 h-4 text-[#ffd700]" />}
          {medal && (
            <span className={`text-[10px] font-black uppercase tracking-widest ${medal.text}`}>
              {medal.tier}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <PercentileBadge percentile={ds?.percentile ?? contributor.percentile} />
          <RankChange delta={delta} />
        </div>
      </div>

      {/* Identity */}
      <div className="flex items-center gap-3 mb-3">
        <Avatar src={contributor.avatarUrl} name={contributor.username} size={44} ring={identity.ring} />
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-white truncate leading-tight">{contributor.username}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${topicChipClass(area.label)}`}>
              {area.label}
            </span>
            <StreakBadge days={contributor.currentStreak} />
          </div>
        </div>
      </div>

      {/* Dimension stat bars */}
      <div className="space-y-2 mb-3">
        {STATS.map((s) => (
          <StatBar key={s.key} statKey={s.key} value={statValue(s.key)} />
        ))}
      </div>

      {/* Ownership + footer total */}
      <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-2.5">
        <div className="min-w-0">
          {typeof ownership === 'number' ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-300" title="Git-blame share of the repo's final code">
              <span className={`w-1.5 h-1.5 ${ownership >= 0.5 ? 'bg-accent' : ownership >= 0.1 ? 'bg-[#00ffff]' : 'bg-zinc-500'}`} />
              Owns {Math.round(ownership * 100)}% of code
            </span>
          ) : (
            <span className="text-[10px] text-zinc-500">Code ownership N/A</span>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[9px] uppercase tracking-widest text-zinc-400 font-semibold">Total</div>
          <div className="flex items-baseline gap-0.5">
            <span className={`text-2xl font-black leading-none ${totalText}`}>{total}</span>
            <span className="text-xs text-zinc-500 font-medium">/100</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function RisingModule({ entries }: { entries: RisingEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-none border border-white/10 bg-black p-3 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingUp className="w-3.5 h-3.5 text-emerald-300" />
        <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wide">Rising this week</span>
      </div>
      <div className="space-y-1.5">
        {entries.map((e) => (
          <div key={e.userId} className="flex items-center gap-2 text-xs">
            <span className="w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-emerald-300">
              <TrendingUp className="w-3 h-3" />
            </span>
            <span className="font-medium text-white truncate flex-1">{e.username}</span>
            <span className="text-zinc-500 truncate max-w-[55%]">{e.reason}</span>
            <span className="text-emerald-300 font-semibold shrink-0">{e.impactScore}/100</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Leaderboard({
  contributors,
  assignment,
  rankDeltas,
  repoOwner,
  repoName,
}: {
  contributors: ContributorInsight[];
  assignment: IdentityAssignment;
  rankDeltas: RankDeltaMap | null;
  repoOwner: string;
  repoName: string;
}) {
  const [animated, setAnimated] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('rank');
  const [expanded, setExpanded] = useState(false);

  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => setAnimated(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const rising = buildRising(contributors, rankDeltas, 3);
  const ranked = [...contributors].sort((a, b) => b.impactScore - a.impactScore);

  // True rank by id from the composite-sorted list, so search/sort of the
  // visible list below does not distort the displayed rank.
  const rankById = new Map(ranked.map((c, i) => [c.id, i + 1]));

  const q = query.trim().toLowerCase();
  const filtered = q ? ranked.filter((c) => c.username.toLowerCase().includes(q)) : ranked;
  const filteredSorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'score':
        return b.impactScore - a.impactScore;
      case 'streak':
        return b.currentStreak - a.currentStreak;
      case 'reviews':
        return b.reviews - a.reviews;
      default:
        return 0;
    }
  });

  const visible = expanded ? filteredSorted : filteredSorted.slice(0, INITIAL_CARDS);
  const hiddenCount = filteredSorted.length - visible.length;

  return (
    <div className="space-y-4">
      <RisingModule entries={rising} />

      <div className="flex items-center gap-2 mb-1">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contributors…"
            className="w-full rounded-none bg-white/5 border border-white/10 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-400 focus:outline-none focus:border-accent/50"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-none bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-accent/50"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key} className="bg-zinc-900">
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Stat color legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
        {STATS.map((s) => (
          <span key={s.key} className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-sm ${s.bar}`} />
            {s.label}
          </span>
        ))}
        <span className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-white/40" />
          Total
        </span>
      </div>

      {/* Pokémon-style card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {visible.map((c) => (
          <ContributorCard
            key={c.id}
            contributor={c}
            rank={rankById.get(c.id) ?? 0}
            assignment={assignment}
            rankDeltas={rankDeltas}
            repoOwner={repoOwner}
            repoName={repoName}
            animate={animated}
          />
        ))}
      </div>

      {visible.length === 0 && (
        <div className="text-center text-xs text-zinc-400 py-4 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          No contributors match &ldquo;{query}&rdquo;
        </div>
      )}

      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white border border-white/5 rounded-none py-2 hover:bg-white/5 transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          Show {hiddenCount} more
        </button>
      )}
      {expanded && filteredSorted.length > INITIAL_CARDS && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white border border-white/5 rounded-none py-2 hover:bg-white/5 transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
          Show fewer
        </button>
      )}
    </div>
  );
}

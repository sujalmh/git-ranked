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
  Sparkles,
} from 'lucide-react';
import type { ContributorInsight } from '@/lib/contributor-insights';
import {
  identityFor,
  podiumStyleForRank,
  breakdownSegments,
  primaryWorkArea,
  topicChipClass,
  buildRising,
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

const INITIAL_ROWS = 6;

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
    <div className="rounded-full bg-white/10" style={{ width: size, height: size }} />
  ) : (
    <Image src={src} alt={name} width={size} height={size} className="rounded-full" />
  );
  if (!ring) return <div className="rounded-full border border-white/10">{inner}</div>;
  return <div className={`rounded-full ${ring} ring-offset-1 ring-offset-black p-[2px]`}>{inner}</div>;
}

function RankChange({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-600" title="No change vs last period">
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

function BreakdownLegend() {
  const segments = [
    { key: 'featureDelivery', label: 'Shipping', className: 'bg-[#ccff00]' },
    { key: 'codeQuality', label: 'Quality', className: 'bg-[#00ffff]' },
    { key: 'reviews', label: 'Reviews', className: 'bg-[#ff00ff]' },
    { key: 'collaboration', label: 'Collab', className: 'bg-[#ff5500]' },
    { key: 'consistency', label: 'Consistency', className: 'bg-[#00ff66]' },
  ];
  return (
    <div className="hidden md:flex flex-wrap gap-x-3 px-1 pb-2">
      {segments.map((s) => (
        <span key={s.key} className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-sm ${s.className}`} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function BreakdownBar({ contributor, animate }: { contributor: ContributorInsight; animate: boolean }) {
  const segments = breakdownSegments(contributor);
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-32 rounded-full overflow-hidden bg-white/5" title="Impact breakdown">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`h-full ${s.className} ${animate ? 'transition-[width] duration-700 ease-out' : ''}`}
            style={{ width: animate ? `${(s.value / total) * 100}%` : '0%' }}
            title={`${s.label}: ${Math.round(s.value)}`}
          />
        ))}
      </div>
    </div>
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

function SmallTeamRow({
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
  return (
    <Link
      href={`/repos/${repoOwner}/${repoName}/${contributor.username}`}
      className="relative block rounded-xl border-y border-r border-y-white/5 border-r-white/5 bg-zinc-900/40 hover:bg-zinc-800/60 pl-5 pr-4 py-3 transition-all duration-300 ease-out overflow-hidden"
      style={{
        opacity: animate ? 1 : 0,
        transform: animate ? 'translateY(0)' : 'translateY(6px)',
        transitionDelay: `${Math.min(rank, 6) * 40}ms`,
      }}
    >
      <div className={`absolute top-0 bottom-0 left-0 w-1 ${identity.dot} shadow-[0_0_8px_0_var(--tw-shadow-color)]`} style={{ '--tw-shadow-color': identity.hex } as any} />
      
      <div className="flex items-center gap-4 relative z-10">
        <span className="w-8 text-center text-2xl font-black text-zinc-500 shrink-0">{rank}</span>
        <Avatar src={contributor.avatarUrl} name={contributor.username} size={36} ring={identity.ring} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-base font-semibold text-white truncate">{contributor.username}</span>
            <StreakBadge days={contributor.currentStreak} />
            <RankChange delta={delta} />
            <span className="text-xs text-zinc-400 uppercase tracking-wide hidden sm:inline">{contributor.role}</span>
          </div>
          <div className="mt-1.5">
            <BreakdownBar contributor={contributor} animate={animate} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-black text-white leading-none mb-1">
            {contributor.impactScore}
            <span className="text-xs text-zinc-500 font-medium ml-0.5">/100</span>
          </div>
          <div className="text-xs uppercase text-zinc-400 tracking-wider font-semibold">Impact</div>
        </div>
      </div>
    </Link>
  );
}

function PodiumCard({
  contributor,
  rank,
  repoOwner,
  repoName,
}: {
  contributor: ContributorInsight;
  rank: number;
  repoOwner: string;
  repoName: string;
}) {
  const style = podiumStyleForRank(rank);
  const area = primaryWorkArea(contributor);
  const isGold = rank === 1;
  return (
    <Link
      href={`/repos/${repoOwner}/${repoName}/${contributor.username}`}
      className={`relative rounded-2xl border ${style?.border ?? 'border-white/10'} bg-zinc-900/40 p-4 flex flex-col items-center text-center hover:bg-zinc-800/60 hover:-translate-y-1 transition-all duration-300 ${isGold ? 'order-first shadow-lg shadow-[#ccff00]/10' : ''}`}
    >
      <div className="relative flex flex-col items-center gap-3">
        <div className="flex items-center gap-1">
          {isGold && <Crown className="w-5 h-5 text-[#ccff00]" />}
          <span className={`text-sm font-black uppercase tracking-wide ${style?.text ?? 'text-zinc-400'}`}>
            #{rank} {style ? style.tier : ''}
          </span>
        </div>
        <Avatar
          src={contributor.avatarUrl}
          name={contributor.username}
          size={rank === 1 ? 64 : 52}
          ring={style?.ring}
        />
        <span className="text-base font-bold text-white truncate max-w-full">{contributor.username}</span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${topicChipClass(area.label)}`}>
          {area.label}
        </span>
        <div className="mt-1">
          <span className="text-2xl font-black text-white">
            {contributor.impactScore}
            <span className="text-sm text-zinc-600 font-medium">/100</span>
          </span>
        </div>
        {contributor.currentStreak > 0 && <StreakBadge days={contributor.currentStreak} />}
      </div>
    </Link>
  );
}

function CompactRow({
  contributor,
  rank,
  rankDeltas,
  repoOwner,
  repoName,
}: {
  contributor: ContributorInsight;
  rank: number;
  rankDeltas: RankDeltaMap | null;
  repoOwner: string;
  repoName: string;
}) {
  const delta = deltaFor(rankDeltas, contributor.id, rank);
  return (
    <Link
      href={`/repos/${repoOwner}/${repoName}/${contributor.username}`}
      className="relative flex items-center gap-3 rounded-lg border-y border-r border-y-white/5 border-r-white/5 bg-zinc-900/40 hover:bg-zinc-800/60 hover:-translate-y-0.5 pl-4 pr-3 py-2 transition-all duration-300 overflow-hidden"
    >
      <div className="absolute top-0 bottom-0 left-0 w-1 bg-white/10" />
      <span className="w-8 text-center text-lg font-black text-zinc-500 shrink-0 relative z-10">{rank}</span>
      <Avatar src={contributor.avatarUrl} name={contributor.username} size={28} />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-white truncate">{contributor.username}</span>
      </div>
      <StreakBadge days={contributor.currentStreak} />
      <RankChange delta={delta} />
      <div className="text-right shrink-0 w-12">
        <span className="text-sm font-bold text-white">
          {contributor.impactScore}
          <span className="text-xs text-zinc-600 ml-0.5">/100</span>
        </span>
      </div>
    </Link>
  );
}

function RisingModule({ entries }: { entries: RisingEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3">
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
  const smallTeam = assignment.smallTeam;
  const [animated, setAnimated] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('rank');
  const [expanded, setExpanded] = useState(false);

  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => setAnimated(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  if (smallTeam) {
    return (
      <div className="space-y-2">
        <BreakdownLegend />
        {contributors.map((c, idx) => (
          <SmallTeamRow
            key={c.id}
            contributor={c}
            rank={idx + 1}
            assignment={assignment}
            rankDeltas={rankDeltas}
            repoOwner={repoOwner}
            repoName={repoName}
            animate={animated}
          />
        ))}
      </div>
    );
  }

  const rising = buildRising(contributors, rankDeltas, 3);
  const ranked = [...contributors].sort((a, b) => b.impactScore - a.impactScore);
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  const q = query.trim().toLowerCase();
  const filtered = q ? rest.filter((c) => c.username.toLowerCase().includes(q)) : rest;
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

  const visibleRest = expanded ? filteredSorted : filteredSorted.slice(0, INITIAL_ROWS);
  const hiddenCount = filteredSorted.length - visibleRest.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {podium.map((c, i) => (
          <PodiumCard
            key={c.id}
            contributor={c}
            rank={i + 1}
            repoOwner={repoOwner}
            repoName={repoName}
          />
        ))}
      </div>

      <RisingModule entries={rising} />

      {rest.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contributors…"
                className="w-full rounded-lg bg-white/5 border border-white/10 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500/50"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key} className="bg-zinc-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            {visibleRest.map((c, i) => (
              <CompactRow
                key={c.id}
                contributor={c}
                rank={i + 4}
                rankDeltas={rankDeltas}
                repoOwner={repoOwner}
                repoName={repoName}
              />
            ))}
            {visibleRest.length === 0 && (
              <div className="text-center text-xs text-zinc-600 py-4 flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                No contributors match &ldquo;{query}&rdquo;
              </div>
            )}
          </div>

          {!expanded && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white border border-white/5 rounded-lg py-2 hover:bg-white/5 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Show {hiddenCount} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

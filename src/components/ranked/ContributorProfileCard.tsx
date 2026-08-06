'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  GitCommit,
  GitPullRequest,
  GitMerge,
  MessageSquare,
  CircleDot,
  Bug,
  HelpCircle,
  Flame,
} from 'lucide-react';
import type { ContributorInsight } from '@/lib/contributor-insights';
import type { AiResult, ContributorProfile, ImpactAnalysis } from '@/lib/ai/types';
import type { EvidenceItem } from '@/lib/evidence';
import { useEvidence } from '@/components/evidence';
import { topicChipClass, randomNeonHex } from './identity';

export type StatKey = 'commits' | 'prsOpened' | 'prsMerged' | 'reviews' | 'issues' | 'fixes';

const ROLE_TIER: Record<string, string> = {
  Builder: 'Tier · Builder',
  Reviewer: 'Tier · Reviewer',
  Stabilizer: 'Tier · Stabilizer',
  Planner: 'Tier · Planner',
  'Release Driver': 'Tier · Release Driver',
  Contributor: 'Contributor',
};

function firstWords(text: string, words = 22) {
  const parts = text.trim().split(/\s+/).slice(0, words).join(' ');
  return parts.length < text.trim().length ? `${parts}…` : parts;
}

function buildDescription(
  contributor: ContributorInsight,
  aiData: { profile: AiResult<ContributorProfile> | null; impact: AiResult<ImpactAnalysis> | null },
): string {
  const explanation = aiData.impact?.payload.explanation?.trim();
  if (explanation) return firstWords(explanation, 24);
  const summary = aiData.profile?.payload.summary?.trim();
  if (summary) return firstWords(summary, 24);
  if (contributor.summary.length > 0) {
    return firstWords(contributor.summary.slice(0, 2).join('. '), 24);
  }
  if (contributor.commits) return `Kept the repository moving with ${contributor.commits} code update${contributor.commits === 1 ? '' : 's'}.`;
  return 'No detailed activity captured for this period.';
}

type Tile = { key: StatKey; icon: React.ReactNode; value: number; label: string };

function StatTile({
  tile,
  highlight,
}: {
  tile: Tile;
  highlight: boolean;
}) {
  if (tile.value === 0 && !highlight) return null;
  return (
    <div
      className={`flex items-center gap-1.5 rounded-none border px-2 py-1 ${
        highlight
          ? 'border-accent/50 bg-accent/10'
          : 'border-white/10 bg-white/5'
      }`}
      title={`${tile.value} ${tile.label}`}
    >
      <span className={highlight ? 'text-accent' : ''}>{tile.icon}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-accent' : 'text-zinc-200'}`}>{tile.value}</span>
    </div>
  );
}

export function ContributorProfileCard({
  contributor,
  aiData,
  contributorEvidence,
  repoOwner,
  repoName,
  highlightStats,
}: {
  contributor: ContributorInsight;
  aiData: { profile: AiResult<ContributorProfile> | null; impact: AiResult<ImpactAnalysis> | null };
  contributorEvidence: EvidenceItem[];
  repoOwner: string;
  repoName: string;
  highlightStats?: Set<StatKey>;
}) {
  const { open } = useEvidence();
  const description = buildDescription(contributor, aiData);
  const breakdown = contributor.score.breakdown;
  const focusAreas = aiData.profile?.payload.focus_areas ?? [];
  const highlight = highlightStats ?? new Set<StatKey>();
  const glowHex = randomNeonHex(contributor.username);

  const tiles: Tile[] = [
    { key: 'commits', icon: <GitCommit className="w-3 h-3 text-zinc-400" />, value: contributor.commits, label: 'commits' },
    { key: 'prsOpened', icon: <GitPullRequest className="w-3 h-3 text-sky-400" />, value: contributor.prsOpened, label: 'PRs opened' },
    { key: 'prsMerged', icon: <GitMerge className="w-3 h-3 text-violet-400" />, value: contributor.prsMerged, label: 'PRs merged' },
    { key: 'reviews', icon: <MessageSquare className="w-3 h-3 text-cyan-400" />, value: contributor.reviews, label: 'reviews given' },
    { key: 'issues', icon: <CircleDot className="w-3 h-3 text-fuchsia-400" />, value: contributor.issues, label: 'issues' },
    { key: 'fixes', icon: <Bug className="w-3 h-3 text-red-400" />, value: contributor.fixes, label: 'fixes' },
  ];

  const showImpactEvidence = () => {
    open({
      title: `${contributor.username} — Impact evidence`,
      blurb: aiData.impact?.payload.explanation ?? 'Supporting PRs, commits, and reviews behind this score.',
      signals: [
        { label: 'Impact', value: String(contributor.impactScore) },
        { label: 'Shipping', value: String(Math.round(breakdown.featureDelivery)) },
        { label: 'Quality', value: String(Math.round(breakdown.codeQuality)) },
        { label: 'Reviews', value: String(Math.round(breakdown.reviews)) },
        { label: 'Collab', value: String(Math.round(breakdown.collaboration)) },
        { label: 'Consistency', value: String(Math.round(breakdown.consistency)) },
      ],
      items: contributorEvidence.slice(0, 12),
    });
  };

  return (
    <div 
      className="relative rounded-none border border-white/10 hover:border-[var(--tw-shadow-color)] bg-black p-4 transition-all duration-300 shadow-[2px_2px_8px_0_var(--tw-shadow-base)] hover:shadow-[0_0_12px_0_var(--tw-shadow-hover)]"
      style={{ 
        '--tw-shadow-color': glowHex,
        '--tw-shadow-base': `${glowHex}0D`,
        '--tw-shadow-hover': `${glowHex}20`
      } as React.CSSProperties}
    >
      <Link href={`/repos/${repoOwner}/${repoName}/${contributor.username}`} className="block">
        <div className="flex items-start gap-3 mb-3">
          {contributor.avatarUrl ? (
            <Image
              src={contributor.avatarUrl}
              alt={contributor.username}
              width={44}
              height={44}
              className="rounded-none border border-white/10"
            />
          ) : (
            <div className="rounded-none border border-white/10 bg-white/10" style={{ width: 44, height: 44 }} />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-white truncate hover:text-accent transition-colors">
              {contributor.username}
            </h3>
            <span className="text-xs uppercase tracking-wide text-zinc-400">{ROLE_TIER[contributor.role] ?? contributor.role}</span>
          </div>
          {contributor.currentStreak > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-full px-1.5 py-0.5 shrink-0">
              <Flame className="w-3 h-3" />
              {contributor.currentStreak}d
            </span>
          )}
          <div className="text-right shrink-0">
            <div className="text-lg font-black text-white leading-none">
              {contributor.impactScore}
              <span className="text-sm text-zinc-500 font-medium ml-0.5">/100</span>
            </div>
          </div>
        </div>

        <p className="text-base text-zinc-200 leading-relaxed mb-4 line-clamp-2">{description}</p>
      </Link>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {tiles.map((tile) => (
          <StatTile key={tile.key} tile={tile} highlight={highlight.has(tile.key)} />
        ))}
      </div>

      {contributor.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {contributor.categories.slice(0, 4).map((cat) => (
            <span
              key={cat.label}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${topicChipClass(cat.label)}`}
            >
              {cat.label}
            </span>
          ))}
        </div>
      )}

      {focusAreas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {focusAreas.slice(0, 4).map((area, i) => (
            <span key={i} className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-xs text-zinc-300">
              {area}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <button
          type="button"
          onClick={showImpactEvidence}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-white transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Why this score?
        </button>
        <Link
          href={`/repos/${repoOwner}/${repoName}/${contributor.username}`}
          className="text-xs text-zinc-400 hover:text-white transition-colors"
        >
          Full profile →
        </Link>
      </div>
    </div>
  );
}

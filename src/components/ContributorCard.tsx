'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { GitMerge, GitPullRequest, MessageSquare, GitCommit, Bug, Tag, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import type { ContributorInsight } from '@/lib/contributor-insights';
import type { AiResult, ContributorProfile, ImpactAnalysis } from '@/lib/ai/types';
import type { EvidenceItem } from '@/lib/evidence';
import { useEvidence } from '@/components/evidence';

const ROLE_PERSONA: Record<string, { tag: string; chip: string }> = {
  Builder: { tag: 'Ships features', chip: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' },
  Reviewer: { tag: 'Unblocks the team', chip: 'bg-blue-500/10 border-blue-500/30 text-blue-300' },
  Stabilizer: { tag: 'Hardens the codebase', chip: 'bg-purple-500/10 border-purple-500/30 text-purple-300' },
  Planner: { tag: 'Shapes the roadmap', chip: 'bg-pink-500/10 border-pink-500/30 text-pink-300' },
  'Release Driver': { tag: 'Cuts the releases', chip: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300' },
  Contributor: { tag: 'Team contributor', chip: 'bg-zinc-500/10 border-zinc-500/30 text-zinc-300' },
};

function firstWords(text: string, words = 10) {
  const parts = text.trim().split(/\s+/).slice(0, words).join(' ');
  return parts.length < text.trim().length ? `${parts}…` : parts;
}

function Avatar({ src, name, size = 44 }: { src: string | null; name: string; size?: number }) {
  if (!src) return <div className="rounded-full bg-white/10 border border-white/10" style={{ width: size, height: size }} />;
  return <Image src={src} alt={name} width={size} height={size} className="rounded-full border border-white/10" />;
}

function StatChip({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/5 px-2 py-1" title={`${value} ${label}`}>
      {icon}
      <span className="text-xs font-semibold text-zinc-200">{value}</span>
    </div>
  );
}

export function ContributorCard({
  contributor,
  aiData,
  contributorEvidence,
}: {
  contributor: ContributorInsight;
  aiData: { profile: AiResult<ContributorProfile> | null; impact: AiResult<ImpactAnalysis> | null };
  contributorEvidence: EvidenceItem[];
}) {
  const { open } = useEvidence();
  const [expanded, setExpanded] = useState(false);

  const persona = ROLE_PERSONA[contributor.role] ?? ROLE_PERSONA.Contributor;
  const tagline = aiData.impact?.payload.explanation
    ? firstWords(aiData.impact.payload.explanation, 12)
    : aiData.profile?.payload.summary
      ? firstWords(aiData.profile.payload.summary, 12)
      : persona.tag;

  const breakdown = contributor.score.breakdown;
  const focusAreas = aiData.profile?.payload.focus_areas ?? [];
  const strengths = aiData.profile?.payload.strengths ?? [];

  const showImpactEvidence = () => {
    open({
      title: `${contributor.username} — Impact evidence`,
      blurb: aiData.impact?.payload.explanation ?? 'Supporting PRs, commits, and reviews behind this score.',
      signals: [
        { label: 'Impact', value: String(contributor.impactScore) },
        { label: 'Features', value: String(breakdown.featureDelivery) },
        { label: 'Quality', value: String(breakdown.codeQuality) },
        { label: 'Reviews', value: String(breakdown.reviews) },
        { label: 'Consistency', value: String(breakdown.consistency) },
      ],
      items: contributorEvidence.slice(0, 12),
    });
  };

  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-4 hover:bg-white/[0.07] transition-colors">
      <div className="flex items-start gap-3 mb-3">
        <Avatar src={contributor.avatarUrl} name={contributor.username} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{contributor.username}</h3>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${persona.chip}`}>{contributor.role}</span>
          </div>
          <p className="text-xs text-zinc-400 leading-snug mt-0.5 line-clamp-2">{tagline}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-black text-indigo-400 leading-none">{contributor.impactScore}</div>
          <div className="text-[9px] uppercase text-zinc-500 tracking-wider">Impact</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <StatChip icon={<GitMerge className="w-3 h-3 text-purple-400" />} value={contributor.prsMerged} label="merged PRs" />
        <StatChip icon={<GitPullRequest className="w-3 h-3 text-green-400" />} value={contributor.prsOpened} label="opened PRs" />
        <StatChip icon={<MessageSquare className="w-3 h-3 text-blue-400" />} value={contributor.reviews} label="reviews" />
        <StatChip icon={<GitCommit className="w-3 h-3 text-zinc-400" />} value={contributor.commits} label="commits" />
        <StatChip icon={<Bug className="w-3 h-3 text-red-400" />} value={contributor.fixes} label="fixes" />
        <StatChip icon={<Tag className="w-3 h-3 text-yellow-400" />} value={contributor.releases} label="releases" />
      </div>

      {focusAreas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {focusAreas.slice(0, 4).map((area, i) => (
            <span key={i} className="rounded-full bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 text-[10px] text-indigo-300">
              {area}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <button
          type="button"
          onClick={showImpactEvidence}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 hover:text-white transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Why this score?
        </button>
        {strengths.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Less' : 'Profile'}
          </button>
        )}
      </div>

      {expanded && strengths.length > 0 && (
        <div className="mt-3 space-y-2">
          {strengths.slice(0, 3).map((s, i) => (
            <div key={i} className="text-xs text-zinc-300 flex gap-2 leading-relaxed">
              <span className="text-emerald-400 mt-0.5">•</span>
              <span>{firstWords(s, 16)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

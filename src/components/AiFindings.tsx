'use client';

import React from 'react';
import { AlertTriangle, TrendingUp, Moon, ShieldAlert, Sparkles, HelpCircle } from 'lucide-react';
import type { TeamInsights } from '@/lib/ai/types';
import type { EvidenceItem } from '@/lib/evidence';
import { findEvidence } from '@/lib/evidence';
import { useEvidence } from '@/components/evidence';

type FindingKind = 'bottleneck' | 'single-owner' | 'rising' | 'quiet' | 'risk';

type Finding = {
  kind: FindingKind;
  text: string;
};

const KIND_META: Record<FindingKind, { icon: typeof AlertTriangle; accent: string; tag: string; chip: string }> = {
  bottleneck: { icon: AlertTriangle, accent: 'text-amber-300', tag: 'Review Bottleneck', chip: 'bg-amber-500/10 border-amber-500/20 text-amber-300' },
  'single-owner': { icon: ShieldAlert, accent: 'text-red-300', tag: 'Single-Owner Risk', chip: 'bg-red-500/10 border-red-500/20 text-red-300' },
  rising: { icon: TrendingUp, accent: 'text-emerald-300', tag: 'Rising Contributor', chip: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' },
  quiet: { icon: Moon, accent: 'text-zinc-300', tag: 'Quiet Area', chip: 'bg-zinc-500/10 border-zinc-500/20 text-zinc-300' },
  risk: { icon: AlertTriangle, accent: 'text-amber-300', tag: 'Risk', chip: 'bg-amber-500/10 border-amber-500/20 text-amber-300' },
};

function buildFindings(teamInsights: TeamInsights | null, risks: string[]): Finding[] {
  const out: Finding[] = [];
  if (teamInsights) {
    for (const t of teamInsights.review_bottlenecks) out.push({ kind: 'bottleneck', text: t });
    for (const t of teamInsights.single_owner_modules) out.push({ kind: 'single-owner', text: t });
    for (const t of teamInsights.rising_contributors) out.push({ kind: 'rising', text: t });
    for (const t of teamInsights.quiet_areas) out.push({ kind: 'quiet', text: t });
  }
  for (const t of risks) out.push({ kind: 'risk', text: t });
  return out;
}

function FindingCard({ finding, pool, usernames }: { finding: Finding; pool: EvidenceItem[]; usernames: string[] }) {
  const { open } = useEvidence();
  const meta = KIND_META[finding.kind];
  const Icon = meta.icon;

  const showWhy = () => {
    const items = findEvidence(finding.text, pool, usernames);
    open({
      title: meta.tag,
      blurb: finding.text,
      items,
    });
  };

  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-4 flex flex-col gap-3 hover:bg-white/[0.07] transition-colors">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${meta.chip}`}>
          <Icon className="w-3 h-3" />
          {meta.tag}
        </span>
      </div>
      <p className="text-sm text-zinc-200 leading-relaxed">{finding.text}</p>
      <button
        type="button"
        onClick={showWhy}
        className="self-start inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 hover:text-white transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        Why?
      </button>
    </div>
  );
}

export function AiFindings({
  teamInsights,
  risks,
  pool,
  usernames,
}: {
  teamInsights: TeamInsights | null;
  risks: string[];
  pool: EvidenceItem[];
  usernames: string[];
}) {
  const findings = buildFindings(teamInsights, risks);

  if (findings.length === 0) {
    return (
      <div className="sleek-panel p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-indigo-300" />
          <h2 className="text-base font-semibold">AI Findings</h2>
        </div>
        <p className="text-sm text-zinc-500">No notable findings surfaced for this period.</p>
      </div>
    );
  }

  return (
    <div className="sleek-panel p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-indigo-300" />
        <h2 className="text-base font-semibold">AI Findings</h2>
        <span className="text-xs text-zinc-500 ml-1">Surfaced risks, bottlenecks & momentum</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {findings.map((f, i) => (
          <FindingCard key={`${f.kind}-${i}`} finding={f} pool={pool} usernames={usernames} />
        ))}
      </div>
    </div>
  );
}

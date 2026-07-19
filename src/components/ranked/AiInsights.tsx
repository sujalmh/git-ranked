'use client';

import React, { useMemo } from 'react';
import {
  AlertTriangle,
  TrendingUp,
  Moon,
  ShieldAlert,
  Sparkles,
  HelpCircle,
  Target,
  Zap,
} from 'lucide-react';
import type { TeamInsights, RepositorySummary } from '@/lib/ai/types';
import type { EvidenceItem } from '@/lib/evidence';
import { findEvidence } from '@/lib/evidence';
import { useEvidence } from '@/components/evidence';
import { SEVERITY, type Severity } from './identity';

type FindingKind = 'risk' | 'bottleneck' | 'single-owner' | 'quiet' | 'rising';

type Finding = {
  kind: FindingKind;
  text: string;
  severity: Severity;
};

const KIND_META: Record<FindingKind, { icon: typeof AlertTriangle; tag: string }> = {
  risk: { icon: AlertTriangle, tag: 'Risk' },
  bottleneck: { icon: AlertTriangle, tag: 'Review Bottleneck' },
  'single-owner': { icon: ShieldAlert, tag: 'Single-Owner Risk' },
  quiet: { icon: Moon, tag: 'Quiet Area' },
  rising: { icon: TrendingUp, tag: 'Rising' },
};

function buildFindings(
  teamInsights: TeamInsights | null,
  risks: string[],
  includeRising: boolean,
): Finding[] {
  const out: Finding[] = [];
  if (teamInsights) {
    for (const t of teamInsights.single_owner_modules) out.push({ kind: 'single-owner', text: t, severity: 'warning' });
    for (const t of teamInsights.review_bottlenecks) out.push({ kind: 'bottleneck', text: t, severity: 'warning' });
    for (const t of teamInsights.quiet_areas) out.push({ kind: 'quiet', text: t, severity: 'info' });
    if (includeRising) {
      for (const t of teamInsights.rising_contributors) out.push({ kind: 'rising', text: t, severity: 'info' });
    }
  }
  for (const t of risks) out.push({ kind: 'risk', text: t, severity: 'risk' });
  return out;
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    const key = f.text.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function shorten(text: string, words = 6): string {
  const parts = text.trim().split(/\s+/).slice(0, words).join(' ');
  return parts.length < text.trim().length ? `${parts}…` : parts;
}

type ChipKind = 'highlight' | 'risk' | 'next';

type Chip = { kind: ChipKind; text: string };

const CHIP_STYLE: Record<ChipKind, string> = {
  highlight: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  risk: 'bg-red-500/10 border-red-500/20 text-red-300',
  next: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300',
};

const CHIP_ICON: Record<ChipKind, React.ReactNode> = {
  highlight: <Zap className="w-3 h-3" />,
  risk: <AlertTriangle className="w-3 h-3" />,
  next: <Target className="w-3 h-3" />,
};

function buildChips(summary: RepositorySummary | null, findings: Finding[]): Chip[] {
  const chips: Chip[] = [];
  const riskCount = findings.filter((f) => f.severity === 'risk').length;
  if (summary) {
    summary.highlights.slice(0, 2).forEach((h) => chips.push({ kind: 'highlight', text: shorten(h) }));
    summary.next_focus.slice(0, 2).forEach((h) => chips.push({ kind: 'next', text: shorten(h) }));
  }
  if (riskCount > 0 && chips.length < 6) {
    chips.push({ kind: 'risk', text: `${riskCount} active risk${riskCount === 1 ? '' : 's'}` });
  }
  return chips.slice(0, 6);
}

function FindingRow({
  finding,
  pool,
  usernames,
}: {
  finding: Finding;
  pool: EvidenceItem[];
  usernames: string[];
}) {
  const { open } = useEvidence();
  const meta = KIND_META[finding.kind];
  const sev = SEVERITY[finding.severity];
  const Icon = meta.icon;

  const showWhy = () => {
    const items = findEvidence(finding.text, pool, usernames);
    open({ title: meta.tag, blurb: finding.text, items });
  };

  return (
    <div className={`rounded-r-lg rounded-l border-l-2 ${sev.border} bg-white/[0.03] py-3 pl-3 pr-3 flex gap-3`}>
      <div className="shrink-0 mt-0.5">
        <Icon className={`w-4 h-4 ${sev.text}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-[10px] font-semibold uppercase tracking-wide ${sev.text} mb-0.5`}>{meta.tag}</div>
        <p className="text-sm text-zinc-200 leading-relaxed">{finding.text}</p>
      </div>
      <button
        type="button"
        onClick={showWhy}
        className="self-start shrink-0 inline-flex items-center gap-1 text-xs font-medium text-indigo-300 hover:text-white transition-colors"
        title="See supporting evidence"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function AiInsights({
  overview,
  summary,
  teamInsights,
  risks,
  pool,
  usernames,
  smallTeam,
}: {
  overview: string | null;
  summary: RepositorySummary | null;
  teamInsights: TeamInsights | null;
  risks: string[];
  pool: EvidenceItem[];
  usernames: string[];
  smallTeam: boolean;
}) {
  const findings = useMemo(
    () => dedupe(buildFindings(teamInsights, risks, smallTeam)),
    [teamInsights, risks, smallTeam],
  );
  const chips = useMemo(() => buildChips(summary, findings), [summary, findings]);

  const hasContent = findings.length > 0 || chips.length > 0 || overview;

  if (!hasContent) {
    return (
      <div className="stark-panel p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-indigo-300" />
          <h2 className="text-base font-semibold">AI Insights</h2>
        </div>
        <p className="text-sm text-zinc-500">No notable insights surfaced for this period.</p>
      </div>
    );
  }

  return (
    <div className="stark-panel p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-indigo-300" />
        <h2 className="text-base font-semibold">AI Insights</h2>
        <span className="text-xs text-zinc-500 ml-1">
          {smallTeam ? 'Per-person findings' : 'Team-distribution patterns'}
        </span>
      </div>

      {overview && (
        <p className="text-sm text-zinc-300 leading-relaxed mb-3 max-w-3xl">{overview}</p>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {chips.map((chip, i) => (
            <span
              key={`${chip.kind}-${i}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${CHIP_STYLE[chip.kind]}`}
            >
              {CHIP_ICON[chip.kind]}
              {chip.text}
            </span>
          ))}
        </div>
      )}

      {findings.length > 0 ? (
        <div className="space-y-2">
          {findings.map((f, i) => (
            <FindingRow key={`${f.kind}-${i}`} finding={f} pool={pool} usernames={usernames} />
          ))}
        </div>
      ) : (
        chips.length > 0 && (
          <p className="text-xs text-zinc-500">No flagged risks this period — see chips above for the at-a-glance summary.</p>
        )
      )}
    </div>
  );
}

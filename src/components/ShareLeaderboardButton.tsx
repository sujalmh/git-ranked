'use client';

import React, { useState, useRef } from 'react';
import { Share2, Check, Download, Copy, X, Loader2 } from 'lucide-react';
import type { ContributorInsight } from '@/lib/contributor-insights';
import {
  primaryWorkArea,
  breakdownSegments,
  randomNeonHex,
} from '@/components/ranked/identity';

// ── helpers matching identity.ts ──────────────────────────────────────────────
const BREAKDOWN_COLOURS = ['#ccff00', '#00ffff', '#ff00ff', '#ff5500', '#00ff66'];

const TOPIC_PALETTE_HEX = [
  { text: '#7dd3fc', bg: 'rgba(14,165,233,0.1)', border: 'rgba(14,165,233,0.2)' }, // sky
  { text: '#f9a8d4', bg: 'rgba(236,72,153,0.1)', border: 'rgba(236,72,153,0.2)' }, // pink
  { text: '#c4b5fd', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.2)' }, // violet
  { text: '#fcd34d', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' }, // amber
  { text: '#e879f9', bg: 'rgba(217,70,239,0.1)', border: 'rgba(217,70,239,0.2)' }, // fuchsia
  { text: '#6ee7b7', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)' }, // emerald
  { text: '#fdba74', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.2)' }, // orange
  { text: '#93c5fd', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)' }, // blue
  { text: '#5eead4', bg: 'rgba(20,184,166,0.1)', border: 'rgba(20,184,166,0.2)' }, // teal
  { text: '#fda4af', bg: 'rgba(244,63,94,0.1)',  border: 'rgba(244,63,94,0.2)'  }, // rose
];
const TOPIC_NEUTRAL_HEX = { text: '#a1a1aa', bg: 'rgba(113,113,122,0.1)', border: 'rgba(113,113,122,0.2)' };

function topicHex(label: string) {
  if (!label || label.toLowerCase() === 'other') return TOPIC_NEUTRAL_HEX;
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return TOPIC_PALETTE_HEX[hash % TOPIC_PALETTE_HEX.length];
}

// Mirrors what the OG route accepts — keep flat + serialisable
export type ContributorSlim = {
  username: string;
  avatarUrl: string | null;
  impactScore: number;
  workArea: string;
  workAreaChip: { text: string; bg: string; border: string };
  rank: number;
  streak: number;
  breakdown: Array<{ hex: string; pct: number }>;
  glowHex: string;
};

function toSlim(c: ContributorInsight, rank: number): ContributorSlim {
  const area = primaryWorkArea(c);
  const segs = breakdownSegments(c);
  const total = segs.reduce((s, x) => s + x.value, 0);
  return {
    username: c.username,
    avatarUrl: c.avatarUrl,
    impactScore: c.impactScore,
    workArea: area.label,
    workAreaChip: topicHex(area.label),
    rank,
    streak: c.currentStreak ?? 0,
    breakdown:
      total > 0
        ? segs.map((s, i) => ({ hex: BREAKDOWN_COLOURS[i] ?? '#888', pct: (s.value / total) * 100 }))
        : [],
    glowHex: randomNeonHex(c.username),
  };
}

function buildOgUrl(owner: string, name: string, contributors: ContributorSlim[]): string {
  const data = encodeURIComponent(JSON.stringify(contributors));
  return `/api/og/leaderboard/${encodeURIComponent(owner)}/${encodeURIComponent(name)}?data=${data}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ShareLeaderboardButton({
  repoOwner,
  repoName,
  contributors,
}: {
  repoOwner: string;
  repoName: string;
  contributors: ContributorInsight[];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const modalRef = useRef<HTMLDivElement>(null);

  // top-9: podium (3) + compact rows (4-9)
  const slimContributors = contributors.slice(0, 9).map((c, i) => toSlim(c, i + 1));
  const ogUrl = buildOgUrl(repoOwner, repoName, slimContributors);
  const absoluteUrl = typeof window !== 'undefined' ? `${window.location.origin}${ogUrl}` : ogUrl;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = ogUrl;
    a.download = `gitranked-${repoOwner}-${repoName}-leaderboard.png`;
    a.click();
  };

  const handleCopy = async () => {
    try {
      setCopying(true);
      const res = await fetch(absoluteUrl);
      if (!res.ok) throw new Error('Failed to fetch image');
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2500);
    } catch (err) {
      console.warn('Copy failed, downloading instead', err);
      handleDownload();
    } finally {
      setCopying(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        data-no-capture="true"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-sm font-semibold text-white transition-all shadow-sm shrink-0 cursor-pointer"
      >
        <Share2 className="w-4 h-4 text-[#ccff00]" />
        <span>Share Leaderboard</span>
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div
            ref={modalRef}
            className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-black border border-white p-6 shadow-[6px_6px_0_0_#fff]"
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/15 mb-4">
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-wider">
                  Leaderboard Preview
                </h3>
                <p className="text-sm text-zinc-400 mt-0.5">
                  Server-rendered — perfect quality.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 mb-6 bg-zinc-950 p-4 border border-white/10 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ogUrl}
                alt="Leaderboard Preview"
                className="max-w-full h-auto object-contain shadow-2xl"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/15">
              <button
                onClick={handleCopy}
                disabled={copying}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white bg-white/10 hover:bg-white/20 text-white font-bold text-base transition-colors cursor-pointer disabled:opacity-60"
              >
                {copying ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /><span>Copying…</span></>
                ) : copyStatus === 'copied' ? (
                  <><Check className="w-5 h-5 text-[#00ff66]" /><span className="text-[#00ff66]">Copied!</span></>
                ) : (
                  <><Copy className="w-5 h-5" /><span>Copy to Clipboard</span></>
                )}
              </button>

              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ccff00] hover:bg-white text-black font-extrabold text-base transition-colors cursor-pointer"
              >
                <Download className="w-5 h-5" />
                <span>Download Image</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

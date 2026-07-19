'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export type ContributionSlice = {
  username: string;
  avatarUrl: string | null;
  additions: number;
  deletions: number;
  changedLines: number;
  prsMerged: number;
};

const SLICE_COLORS = [
  '#818cf8',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#22d3ee',
  '#f472b6',
  '#a78bfa',
  '#fb923c',
  '#4ade80',
  '#60a5fa',
  '#e879f9',
  '#facc15',
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

type TooltipPayload = {
  payload: ContributionSlice & { fill: string; percent: number };
};

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="stark-panel px-3 py-2 text-xs space-y-1">
      <div className="font-bold text-white flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.fill }} />
        {d.username}
      </div>
      <div className="text-zinc-300">
        <span className="text-emerald-400">+{formatNumber(d.additions)}</span>
        {' / '}
        <span className="text-red-400">-{formatNumber(d.deletions)}</span>
      </div>
      <div className="text-zinc-400">{d.prsMerged} PR(s) merged · {Math.round(d.percent * 100)}% of code changes</div>
    </div>
  );
}

export function CodeContributionDonut({
  slices,
  totalLabel = 'Code Changes',
}: {
  slices: ContributionSlice[];
  totalLabel?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.changedLines, 0);

  if (total === 0 || slices.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
        No code changes recorded yet.
      </div>
    );
  }

  const chartData = slices.map((s, i) => ({
    ...s,
    name: s.username,
    value: s.changedLines,
    fill: SLICE_COLORS[i % SLICE_COLORS.length],
    percent: s.changedLines / total,
  }));

  return (
    <div className="flex flex-col md:flex-row items-center gap-6">
      {/* Donut chart */}
      <div className="relative" style={{ width: 220, height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={100}
              paddingAngle={1.5}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={1}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-black text-white">{formatNumber(total)}</span>
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">{totalLabel}</span>
        </div>
      </div>

      {/* Legend / breakdown */}
      <div className="flex-1 w-full space-y-2">
        {chartData
          .slice()
          .sort((a, b) => b.value - a.value)
          .map((entry) => (
            <div key={entry.username} className="flex items-center gap-3">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: entry.fill }}
              />
              <span className="text-sm text-zinc-200 flex-1 truncate">{entry.username}</span>
              <span className="text-xs text-emerald-400 font-medium">+{formatNumber(entry.additions)}</span>
              <span className="text-xs text-red-400 font-medium">-{formatNumber(entry.deletions)}</span>
              <span className="text-xs text-zinc-400 w-10 text-right">
                {Math.round(entry.percent * 100)}%
              </span>
              <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${entry.percent * 100}%`, background: entry.fill }}
                />
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

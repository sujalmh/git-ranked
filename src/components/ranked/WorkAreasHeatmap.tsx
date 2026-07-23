'use client';

import React, { useMemo, useState } from 'react';
import { Treemap, ResponsiveContainer } from 'recharts';
import { Proportions } from 'lucide-react';

export type HeatmapContributor = {
  id: number;
  username: string;
  avatarUrl: string | null;
  areas: { label: string; value: number }[];
};

type HoverState = {
  name: string;
  value: number;
  percent: number;
  color: string;
  contributors: { name: string; size: number; pct: number }[];
} | null;

const PALETTE = [
  { fill: '#500724', stroke: '#f43f5e', text: '#fecdd3', glow: 'rgba(244,63,94,0.35)' }, // Pink
  { fill: '#1a2600', stroke: '#ccff00', text: '#e6ff80', glow: 'rgba(204,255,0,0.35)' }, // Neon Lime
  { fill: '#451a03', stroke: '#fbbf24', text: '#fef3c7', glow: 'rgba(251,191,36,0.35)' }, // Amber
  { fill: '#172554', stroke: '#60a5fa', text: '#dbeafe', glow: 'rgba(96,165,250,0.35)' }, // Blue
  { fill: '#064e3b', stroke: '#00ff66', text: '#dcfce7', glow: 'rgba(0,255,102,0.35)' }, // Neon Green
  { fill: '#083344', stroke: '#00ffff', text: '#cffafe', glow: 'rgba(0,255,255,0.35)' }, // Cyan
  { fill: '#3b0764', stroke: '#c084fc', text: '#f3e8ff', glow: 'rgba(192,132,252,0.35)' }, // Purple
  { fill: '#4c0519', stroke: '#fb7185', text: '#ffe4e6', glow: 'rgba(251,113,133,0.35)' }, // Rose
  { fill: '#431407', stroke: '#fb923c', text: '#ffedd5', glow: 'rgba(251,146,60,0.35)' }, // Orange
  { fill: '#042f2e', stroke: '#2dd4bf', text: '#ccfbf1', glow: 'rgba(45,212,191,0.35)' }, // Teal
  { fill: '#1e1b4b', stroke: '#818cf8', text: '#e0e7ff', glow: 'rgba(129,140,248,0.35)' }, // Indigo
  { fill: '#422006', stroke: '#facc15', text: '#fef9c3', glow: 'rgba(250,204,21,0.35)' }, // Yellow
];

export function WorkAreasHeatmap({
  contributors,
}: {
  contributors: HeatmapContributor[];
  smallTeam: boolean;
}) {
  const [hovered, setHovered] = useState<HoverState>(null);

  const { treeData, grandTotal } = useMemo(() => {
    const areaMap = new Map<string, { name: string; size: number }[]>();

    for (const c of contributors) {
      for (const a of c.areas) {
        if (a.value > 0) {
          if (!areaMap.has(a.label)) areaMap.set(a.label, []);
          areaMap.get(a.label)!.push({ name: c.username, size: a.value });
        }
      }
    }

    const data = Array.from(areaMap.entries()).map(([label, children]) => ({
      name: label,
      children: children.sort((a, b) => b.size - a.size),
    }));

    data.sort((a, b) => {
      const sumA = a.children.reduce((acc, c) => acc + c.size, 0);
      const sumB = b.children.reduce((acc, c) => acc + c.size, 0);
      return sumB - sumA;
    });

    const grandTotal = data.reduce(
      (acc, d) => acc + d.children.reduce((s, c) => s + c.size, 0),
      0
    );

    return { treeData: data, grandTotal };
  }, [contributors]);

  if (treeData.length === 0) {
    return <div className="sleek-panel p-5 text-sm text-zinc-500 font-mono">No work-area data yet.</div>;
  }

  const CustomizedContent = (props: any) => {
    const { depth, x, y, width, height, index, name, value } = props;

    if (depth !== 1) return null;

    const theme = PALETTE[index % PALETTE.length];
    const areaTotal = value ?? 0;
    const percent = grandTotal > 0 ? Math.round((areaTotal / grandTotal) * 100) : 0;
    const areaContributors = (treeData[index]?.children ?? []).map((c) => ({
      ...c,
      pct: areaTotal > 0 ? Math.round((c.size / areaTotal) * 100) : 0,
    }));

    const clipId = `clip-${index}-${Math.round(x)}-${Math.round(y)}`;
    const isHovered = hovered?.name === name;

    // Minimum size requirements: do NOT display font if box is too small
    const minWidthForLabel = 42;
    const minHeightForLabel = 28;
    const showLabel = width >= minWidthForLabel && height >= minHeightForLabel;
    const showPct = showLabel && height >= 48;

    // Proportional font sizing: scale up font size for bigger boxes with a minimum of 10px
    const rectArea = width * height;
    let fontSize = 10; // minimum font size
    if (rectArea > 22000) {
      fontSize = Math.min(22, Math.max(14, Math.floor(width / 9)));
    } else if (rectArea > 9000) {
      fontSize = Math.min(16, Math.max(12, Math.floor(width / 8.5)));
    } else if (rectArea > 3500) {
      fontSize = Math.min(13, Math.max(11, Math.floor(width / 7.5)));
    } else {
      fontSize = 10;
    }

    const pctSize = Math.max(9, Math.floor(fontSize * 0.8));

    // Truncate name cleanly if needed for available width
    const maxChars = Math.max(3, Math.floor((width - 6) / (fontSize * 0.62)));
    const displayName = name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name;

    return (
      <g
        style={{ cursor: 'pointer' }}
        onMouseEnter={() =>
          setHovered({ name, value: areaTotal, percent, color: theme.stroke, contributors: areaContributors })
        }
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={x + 3} y={y + 3} width={width - 6} height={height - 6} />
          </clipPath>
        </defs>

        <rect
          x={x + 1}
          y={y + 1}
          width={width - 2}
          height={height - 2}
          rx={6}
          ry={6}
          style={{
            fill: theme.fill,
            stroke: theme.stroke,
            strokeWidth: isHovered ? 3.5 : 2,
            strokeOpacity: 0.95,
            fillOpacity: isHovered ? 0.95 : 0.75,
            filter: isHovered ? `drop-shadow(0 0 12px ${theme.glow})` : undefined,
          }}
        />

        {showLabel && (
          <g clipPath={`url(#${clipId})`} style={{ pointerEvents: 'none' }}>
            <text
              x={x + width / 2}
              y={showPct ? y + height / 2 - (fontSize * 0.5) : y + height / 2}
              textAnchor="middle"
              fill="#ffffff"
              stroke="none"
              fontSize={fontSize}
              fontWeight={fontSize >= 14 ? 900 : 700}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
              dominantBaseline="middle"
            >
              {displayName}
            </text>
            {showPct && (
              <text
                x={x + width / 2}
                y={y + height / 2 + (fontSize * 0.6)}
                textAnchor="middle"
                fill={theme.text}
                stroke="none"
                fontSize={pctSize}
                fontWeight={500}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
                dominantBaseline="middle"
              >
                {percent}%
              </text>
            )}
          </g>
        )}
      </g>
    );
  };

  return (
    <div className="sleek-panel p-5 font-mono">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Proportions className="w-6 h-6 text-[#00ffff]" />
          <h2 className="text-xl font-bold text-white">Work Areas Treemap</h2>
        </div>
        <span className="text-base text-zinc-300">Hover a block to see contributors</span>
      </div>

      <div className="flex gap-4 items-stretch">
        {/* Treemap */}
        <div className="flex-1 h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={treeData}
              dataKey="size"
              stroke="#000"
              fill="#8884d8"
              content={<CustomizedContent />}
            />
          </ResponsiveContainer>
        </div>

        {/* Fixed detail panel */}
        <div className="w-80 shrink-0 flex flex-col">
          {hovered ? (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div
                className="rounded-t-lg px-4 py-3 flex items-center justify-between gap-2"
                style={{ backgroundColor: hovered.color + 'cc' }}
              >
                <span className="text-white font-bold text-sm truncate">{hovered.name}</span>
                <span className="text-white/80 text-xs font-bold shrink-0">{hovered.percent}%</span>
              </div>
              <div className="rounded-b-lg border border-white/10 border-t-0 bg-black/80 px-4 py-3 flex-1 flex flex-col">
                <div className="text-xs text-zinc-500 mb-3">{hovered.value} total events</div>
                {/* Scrollable contributor list */}
                <div className="flex-1 overflow-y-auto space-y-2" style={{ maxHeight: '280px' }}>
                  {hovered.contributors.map((c, i) => (
                    <div key={c.name} className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-200 font-medium truncate">{c.name}</span>
                        <span className="text-zinc-500 shrink-0 ml-2">{c.pct}%</span>
                      </div>
                      {/* Mini bar */}
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${c.pct}%`,
                            backgroundColor: hovered.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full rounded-lg border border-white/5 bg-white/[0.02] flex flex-col items-center justify-center text-center px-4 gap-3">
              <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Hover any block to see who worked in that area
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

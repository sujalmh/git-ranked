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

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6',
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
    return <div className="sleek-panel p-5 text-sm text-zinc-500">No work-area data yet.</div>;
  }

  const CustomizedContent = (props: any) => {
    const { depth, x, y, width, height, index, name, value } = props;

    if (depth !== 1) return null;

    const bg = COLORS[index % COLORS.length];
    const areaTotal = value ?? 0;
    const percent = grandTotal > 0 ? Math.round((areaTotal / grandTotal) * 100) : 0;
    const areaContributors = (treeData[index]?.children ?? []).map((c) => ({
      ...c,
      pct: areaTotal > 0 ? Math.round((c.size / areaTotal) * 100) : 0,
    }));

    const clipId = `clip-${index}-${Math.round(x)}-${Math.round(y)}`;
    const isHovered = hovered?.name === name;
    const showLabel = width > 70 && height > 52;
    const showPct = width > 70 && height > 68;
    const fontSize = Math.min(12, Math.max(9, width / 8));
    const pctSize = Math.min(10, Math.max(8, width / 10));
    // Truncate name so it fits within the rect
    const maxChars = Math.max(3, Math.floor(width / (fontSize * 0.6)));
    const displayName = name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name;

    return (
      <g
        style={{ cursor: 'pointer' }}
        onMouseEnter={() =>
          setHovered({ name, value: areaTotal, percent, color: bg, contributors: areaContributors })
        }
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={x + 2} y={y + 2} width={width - 4} height={height - 4} />
          </clipPath>
        </defs>

        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: bg,
            stroke: '#000',
            strokeWidth: isHovered ? 3 : 2,
            fillOpacity: isHovered ? 1 : 0.82,
          }}
        />

        {showLabel && (
          <g clipPath={`url(#${clipId})`} style={{ pointerEvents: 'none' }}>
            <text
              x={x + width / 2}
              y={showPct ? y + height / 2 - 8 : y + height / 2}
              textAnchor="middle"
              fill="#ffffff"
              stroke="none"
              fontSize={fontSize}
              fontWeight={700}
              dominantBaseline="middle"
            >
              {displayName}
            </text>
            {showPct && (
              <text
                x={x + width / 2}
                y={y + height / 2 + 10}
                textAnchor="middle"
                fill="rgba(255,255,255,0.85)"
                stroke="none"
                fontSize={pctSize}
                fontWeight={500}
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
    <div className="sleek-panel p-5">
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

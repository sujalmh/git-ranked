'use client';

import React, { useMemo, useState } from 'react';
import type { ContributorInsight } from '@/lib/contributor-insights';
import type { ReviewGraphEdge } from '@/lib/collaboration-analytics';

type Node = {
  id: number;
  username: string;
  avatarUrl: string | null;
  x: number;
  y: number;
  impactScore: number;
};

type Edge = ReviewGraphEdge & {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function layoutNodes(contributors: ContributorInsight[], width: number, height: number): Node[] {
  const n = contributors.length;
  if (n === 0) return [];

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.35;

  return contributors.map((c, i) => {
    if (n === 1) return { ...c, id: c.id, x: cx, y: cy, impactScore: c.impactScore };
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      id: c.id,
      username: c.username,
      avatarUrl: c.avatarUrl,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      impactScore: c.impactScore,
    };
  });
}

const EDGE_COLORS = [
  '#818cf8',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#22d3ee',
  '#f472b6',
  '#a78bfa',
  '#fb923c',
];

export function CollaborationNetwork({
  contributors,
  reviewGraph,
}: {
  contributors: ContributorInsight[];
  reviewGraph: ReviewGraphEdge[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const width = 460;
  const height = 360;

  const nodes = useMemo(() => layoutNodes(contributors.slice(0, 8), width, height), [contributors]);
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const edges: Edge[] = useMemo(() => {
    return reviewGraph
      .filter(e => nodeMap.has(e.reviewerId) && nodeMap.has(e.authorId))
      .map(e => {
        const r = nodeMap.get(e.reviewerId)!;
        const a = nodeMap.get(e.authorId)!;
        return { ...e, x1: r.x, y1: r.y, x2: a.x, y2: a.y };
      });
  }, [reviewGraph, nodeMap]);

  const maxCount = Math.max(...edges.map(e => e.count), 1);

  if (edges.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
        No review relationships found in this period.
      </div>
    );
  }

  const isConnected = (id: number) =>
    hovered === null ? true : edges.some(e =>
      (e.reviewerId === id && e.authorId === hovered) ||
      (e.authorId === id && e.reviewerId === hovered) ||
      id === hovered
    );

  return (
    <div className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: height }}>
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <polygon points="0 0, 6 3, 0 6" fill="rgba(129,140,248,0.5)" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const isActive = hovered === null || e.reviewerId === hovered || e.authorId === hovered;
          const color = EDGE_COLORS[i % EDGE_COLORS.length];
          const strokeWidth = 1 + (e.count / maxCount) * 3;
          return (
            <line
              key={i}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeOpacity={isActive ? 0.6 : 0.12}
              markerEnd="url(#arrowhead)"
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const active = hovered === null || isConnected(n.id);
          const r = 14 + (n.impactScore / 100) * 10;
          return (
            <g
              key={n.id}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill="rgba(99,102,241,0.15)"
                stroke={active ? '#818cf8' : 'rgba(255,255,255,0.15)'}
                strokeWidth={active ? 2 : 1}
              />
              <text
                x={n.x}
                y={n.y + r + 12}
                textAnchor="middle"
                className="fill-zinc-300 text-[10px] font-medium"
                opacity={active ? 1 : 0.3}
              >
                {n.username.length > 10 ? n.username.slice(0, 9) + '…' : n.username}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-indigo-400/60" /> reviewed →
        </span>
        <span> thicker line = more reviews</span>
      </div>
    </div>
  );
}

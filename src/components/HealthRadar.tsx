'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import type { HealthMetrics } from '@/lib/insights';
import type { MetricEvidence, HealthMetricKey } from '@/lib/evidence';
import { useEvidence } from '@/components/evidence';

type Row = { key: HealthMetricKey; label: string; value: number; color: string; ring: string };

const ROWS: Row[] = [
  { key: 'delivery', label: 'Delivery', value: 0, color: 'bg-green-400', ring: 'text-green-300' },
  { key: 'collaboration', label: 'Collaboration', value: 0, color: 'bg-blue-400', ring: 'text-blue-300' },
  { key: 'codeQuality', label: 'Code Quality', value: 0, color: 'bg-purple-400', ring: 'text-purple-300' },
  { key: 'reviewHealth', label: 'Review Health', value: 0, color: 'bg-pink-400', ring: 'text-pink-300' },
  { key: 'knowledgeDistribution', label: 'Knowledge', value: 0, color: 'bg-yellow-400', ring: 'text-yellow-300' },
];

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const ref = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => {
      if (ref.current) cancelAnimationFrame(ref.current);
    };
  }, [target, duration]);
  return value;
}

export function HealthRadar({
  metrics,
  metricEvidence,
}: {
  metrics: HealthMetrics;
  metricEvidence: MetricEvidence[];
}) {
  const { open } = useEvidence();
  const [mounted, setMounted] = useState(false);
  const animatedScore = useCountUp(metrics.overallScore);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const rows = useMemo(() => {
    const map = new Map(metricEvidence.map((m) => [m.key, m]));
    return ROWS.map((r) => ({
      ...r,
      value: metrics[r.key] ?? 0,
      evidence: map.get(r.key),
    }));
  }, [metrics, metricEvidence]);

  const chartData = rows.map((r) => ({ metric: r.label, value: r.value }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-3xl font-black text-white leading-none">
            {animatedScore}
            <span className="text-sm text-zinc-500 font-medium">/100</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mt-1">Overall Health</div>
        </div>
        <span className="text-[10px] text-zinc-600 hidden sm:block">Click a metric for evidence</span>
      </div>

      <div className="h-44 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} outerRadius="72%">
            <PolarGrid stroke="rgba(255,255,255,0.1)" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              name="Health"
              dataKey="value"
              stroke="#ccff00"
              strokeWidth={2}
              fill="url(#radarFill)"
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            />
            <defs>
              <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ccff00" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#ccff00" stopOpacity={0.05} />
              </linearGradient>
            </defs>
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2.5">
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => r.evidence && open({
              title: r.evidence.label,
              blurb: r.evidence.blurb,
              signals: r.evidence.signals,
              items: r.evidence.items,
            })}
            className="group w-full text-left flex items-center gap-3 rounded-lg px-1.5 py-1 hover:bg-white/5 transition-colors"
          >
            <span className={`text-xs w-24 shrink-0 ${r.ring} group-hover:text-white transition-colors`}>{r.label}</span>
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full ${r.color} rounded-full transition-[width] duration-700 ease-out`}
                style={{ width: mounted ? `${r.value}%` : '0%' }}
              />
            </div>
            <span className="text-xs text-white font-medium w-8 text-right">{r.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

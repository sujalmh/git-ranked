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
import { SEVERITY, type Severity } from './identity';

type Row = { key: HealthMetricKey; label: string; short: string; value: number; bar: string; text: string };

const ROWS: Row[] = [
  { key: 'delivery', label: 'Delivery', short: 'Delivery', value: 0, bar: 'bg-accent', text: 'text-accent' },
  { key: 'collaboration', label: 'Collaboration', short: 'Collab', value: 0, bar: 'bg-[#00ffff]', text: 'text-[#00ffff]' },
  { key: 'codeQuality', label: 'Code Quality', short: 'Quality', value: 0, bar: 'bg-[#ff00ff]', text: 'text-[#ff00ff]' },
  { key: 'reviewHealth', label: 'Review Health', short: 'Reviews', value: 0, bar: 'bg-[#00ff66]', text: 'text-[#00ff66]' },
  { key: 'knowledgeDistribution', label: 'Knowledge', short: 'Knowledge', value: 0, bar: 'bg-[#ff5500]', text: 'text-[#ff5500]' },
];

function severityFor(score: number): Severity {
  if (score < 40) return 'risk';
  if (score < 70) return 'warning';
  return 'info';
}

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

export function HealthCard({
  metrics,
  metricEvidence,
}: {
  metrics: HealthMetrics;
  metricEvidence: MetricEvidence[];
}) {
  const { open } = useEvidence();
  const [mounted, setMounted] = useState(false);
  const animatedScore = useCountUp(metrics.overallScore);
  const sev = severityFor(metrics.overallScore);
  const sevStyle = SEVERITY[sev];

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

  const chartData = rows.map((r) => ({ metric: r.short, value: r.value }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className={`text-5xl font-black leading-none ${sevStyle.text}`}>
            {animatedScore}
            <span className="text-lg text-zinc-400 font-medium ml-1">/100</span>
          </div>
          <div className="text-sm uppercase tracking-wider text-zinc-500 font-semibold mt-2">
            Team Health · {sevStyle.label}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-3">
        <div className="h-40 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={chartData} outerRadius="70%">
              <PolarGrid stroke="rgba(255,255,255,0.2)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#ffffff', fontSize: 11, fontWeight: 700 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name="Health"
                dataKey="value"
                stroke="#ccff00"
                strokeWidth={2}
                fill="url(#healthRadarFill)"
                isAnimationActive
                animationDuration={900}
                animationEasing="ease-out"
              />
              <defs>
                <linearGradient id="healthRadarFill" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#ccff00" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#00ffff" stopOpacity={0.25} />
                </linearGradient>
              </defs>
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-2">
          {rows.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() =>
                r.evidence &&
                open({
                  title: r.evidence.label,
                  blurb: r.evidence.blurb,
                  signals: r.evidence.signals,
                  items: r.evidence.items,
                })
              }
              className="group w-full text-left flex items-center gap-2 rounded-none px-1.5 py-1 hover:bg-white/5 transition-colors"
            >
              <span className={`text-sm font-bold w-20 shrink-0 ${r.text} group-hover:text-white transition-colors`}>{r.short}</span>
              <div className="flex-1 h-2 bg-white/10 rounded-none overflow-hidden">
                <div
                  className={`h-full ${r.bar} rounded-none transition-[width] duration-700 ease-out`}
                  style={{ width: mounted ? `${r.value}%` : '0%' }}
                />
              </div>
              <span className="text-base text-white font-semibold w-8 text-right">{r.value}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

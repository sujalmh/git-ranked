'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';
import { Activity, Brain, Trophy } from 'lucide-react';

const SAMPLE = [
  { metric: 'Delivery' },
  { metric: 'Collaboration' },
  { metric: 'Quality' },
  { metric: 'Reviews' },
  { metric: 'Knowledge' },
];

const TARGET = [86, 72, 91, 64, 78];

function useAnimatedValues(targets: number[], delay = 200, duration = 1100) {
  const [values, setValues] = useState(targets.map(() => 0));
  useEffect(() => {
    const start = performance.now() + delay;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      setValues(targets.map((v) => Math.round(v * eased)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targets, delay, duration]);
  return values;
}

function FloatCard({
  icon,
  label,
  value,
  className,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className: string;
  delay: number;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(id);
  }, [delay]);
  return (
    <div
      className={`absolute glass rounded-xl px-3 py-2 flex items-center gap-2 transition-all duration-500 ${shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'} ${className}`}
    >
      <div className="shrink-0">{icon}</div>
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
        <div className="text-sm font-bold text-white">{value}</div>
      </div>
    </div>
  );
}

export function HeroVisual() {
  const animated = useAnimatedValues(TARGET);
  const chartData = useMemo(
    () => SAMPLE.map((s, i) => ({ metric: s.metric, value: animated[i] })),
    [animated]
  );

  return (
    <div className="relative w-full aspect-square max-w-md mx-auto">
      <div className="absolute inset-0 rounded-full bg-indigo-600/20 blur-[80px] pointer-events-none" />

      <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} outerRadius="74%">
            <PolarGrid stroke="rgba(255,255,255,0.08)" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
            <Radar
              dataKey="value"
              stroke="#818cf8"
              strokeWidth={2}
              fill="url(#heroRadarFill)"
              isAnimationActive
              animationDuration={1100}
              animationEasing="ease-out"
              dot={{ r: 3, fill: '#a855f7', strokeWidth: 0 }}
            />
            <defs>
              <linearGradient id="heroRadarFill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#ec4899" stopOpacity={0.18} />
              </linearGradient>
            </defs>
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <FloatCard
        icon={<Activity className="w-4 h-4 text-green-400" />}
        label="Health"
        value="86/100"
        className="top-2 -left-2 sm:left-0"
        delay={350}
      />
      <FloatCard
        icon={<Brain className="w-4 h-4 text-purple-400" />}
        label="AI Findings"
        value="4 risks"
        className="top-1/3 -right-2 sm:right-0"
        delay={550}
      />
      <FloatCard
        icon={<Trophy className="w-4 h-4 text-pink-400" />}
        label="Top Impact"
        value="94"
        className="bottom-4 left-2 sm:left-4"
        delay={750}
      />
    </div>
  );
}

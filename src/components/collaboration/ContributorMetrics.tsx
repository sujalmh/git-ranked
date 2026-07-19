import React from 'react';
import { ContributorStats } from '@/lib/collaboration-analytics';

export function VelocitySparkline({ values, color = '#818cf8' }: { values: number[]; color?: string }) {
  if (!values || values.length === 0) {
    return <div className="text-xs text-zinc-600">No data</div>;
  }

  const max = Math.max(...values, 1);
  const width = 120;
  const height = 32;
  const barWidth = width / values.length;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {values.map((v, i) => {
        const barHeight = (v / max) * (height - 4);
        return (
          <rect
            key={i}
            x={i * barWidth + 1}
            y={height - barHeight}
            width={barWidth - 2}
            height={Math.max(barHeight, v > 0 ? 2 : 0)}
            rx={2}
            fill={color}
            opacity={v > 0 ? 0.9 : 0.3}
          />
        );
      })}
    </svg>
  );
}

const WORK_TYPE_COLORS: Record<string, string> = {
  'Feature': 'bg-emerald-500',
  'Bug Fix': 'bg-red-500',
  'Code Review': 'bg-blue-500',
  'Refactor': 'bg-purple-500',
  'Testing': 'bg-cyan-500',
  'Documentation': 'bg-amber-500',
  'Performance': 'bg-pink-500',
  'Planning': 'bg-orange-500',
  'Release': 'bg-yellow-500',
  'Other': 'bg-zinc-500',
};

export function WorkDistributionBar({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  if (total === 0) return null;

  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
        {entries.map(([type, count]) => {
          const pct = (count / total) * 100;
          return (
            <div
              key={type}
              className={WORK_TYPE_COLORS[type] ?? 'bg-zinc-500'}
              style={{ width: `${pct}%` }}
              title={`${type}: ${count} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
        {entries.slice(0, 4).map(([type, count]) => (
          <span key={type} className="text-xs text-zinc-400 flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${WORK_TYPE_COLORS[type] ?? 'bg-zinc-500'}`} />
            {type} ({count})
          </span>
        ))}
      </div>
    </div>
  );
}

export function MetricChip({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/5">
      <span className={`text-sm font-bold ${color ?? 'text-white'}`}>{value}</span>
      <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</span>
    </div>
  );
}

export function StreakIndicator({ current, longest }: { current: number; longest: number }) {
  if (current === 0 && longest === 0) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {current > 0 && (
        <span className="flex items-center gap-1 text-orange-300" title={`Current ${current}-day streak`}>
          🔥 {current}d
        </span>
      )}
      {longest > 0 && (
        <span className="text-zinc-500" title={`Longest streak: ${longest} days`}>
          best {longest}d
        </span>
      )}
    </div>
  );
}

export function CollaborationScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-sm font-bold text-white leading-none">{score}</div>
      </div>
    </div>
  );
}

export { type ContributorStats };

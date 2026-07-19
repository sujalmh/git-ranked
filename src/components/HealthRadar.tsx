import React from 'react';
import { HealthMetrics } from '@/lib/insights';

export function HealthRadar({ metrics }: { metrics: HealthMetrics }) {
  // A simple visual representation using bars for now
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-2xl font-black text-white">{metrics.overallScore}/100</div>
        <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Overall Health</div>
      </div>
      
      <HealthBar label="Delivery" value={metrics.delivery} color="bg-green-400" />
      <HealthBar label="Collaboration" value={metrics.collaboration} color="bg-blue-400" />
      <HealthBar label="Code Quality" value={metrics.codeQuality} color="bg-purple-400" />
      <HealthBar label="Review Health" value={metrics.reviewHealth} color="bg-pink-400" />
      <HealthBar label="Knowledge Distribution" value={metrics.knowledgeDistribution} color="bg-yellow-400" />
    </div>
  );
}

function HealthBar({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="text-white font-medium">{value}</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

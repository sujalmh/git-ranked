'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export type ScoreBreakdown = {
  featureDelivery: number;
  codeQuality: number;
  reviews: number;
  collaboration: number;
  consistency: number;
};

export function ExplainableScore({ total, breakdown }: { total: number, breakdown: ScoreBreakdown }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col">
      <div 
        className="flex items-center gap-3 cursor-pointer group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-[2px]">
          <div className="h-full w-full rounded-full bg-zinc-950 flex items-center justify-center font-black text-xl">
            {total}
          </div>
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white flex items-center gap-1 group-hover:text-indigo-300 transition-colors">
            AI Impact Score
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
          <div className="text-xs text-zinc-500">
            Weighted by features, quality, and collaboration
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
          <ScoreRow label="Feature Delivery" value={breakdown.featureDelivery} />
          <ScoreRow label="Code Quality" value={breakdown.codeQuality} />
          <ScoreRow label="Reviews" value={breakdown.reviews} />
          <ScoreRow label="Collaboration" value={breakdown.collaboration} />
          <ScoreRow label="Consistency" value={breakdown.consistency} />
        </div>
      )}
    </div>
  );
}

function ScoreRow({ label, value }: { label: string, value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

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
        className="flex items-center gap-4 cursor-pointer group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="relative h-20 w-20 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-white/15"
              strokeWidth="3.5"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-accent transition-all duration-1000 ease-out"
              strokeDasharray={`${total}, 100`}
              strokeWidth="3.5"
              strokeLinecap="round"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-black text-2xl text-white">{total}</span>
            <span className="text-xs text-zinc-400 font-bold ml-0.5 mt-1">/100</span>
          </div>
        </div>
        <div className="flex-1">
          <div className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-1 group-hover:text-accent transition-colors">
            AI Impact Score
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
          <div className="text-sm text-zinc-400 mt-0.5">
            Weighted by features, quality, and collaboration
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 p-4 rounded-none bg-white/5 border border-white/5 space-y-3">
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

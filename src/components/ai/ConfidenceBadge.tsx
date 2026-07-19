import { ShieldCheck, AlertTriangle } from 'lucide-react';

export function ConfidenceBadge({
  confidence,
  source,
}: {
  confidence: number;
  source: 'ai' | 'fallback';
}) {
  const pct = Math.round(confidence * 100);
  const isAi = source === 'ai';
  const isHigh = confidence >= 0.7;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
        isAi
          ? isHigh
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          : 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400'
      }`}
      title={isAi ? `AI-generated (${pct}% confidence)` : 'Deterministic fallback (AI unavailable)'}
    >
      {isAi ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {isAi ? `${pct}%` : 'fallback'}
    </span>
  );
}

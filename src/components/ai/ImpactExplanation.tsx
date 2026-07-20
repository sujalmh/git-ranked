import { Brain, Signal } from 'lucide-react';
import type { AiResult, ImpactAnalysis } from '@/lib/ai/types';
import type { ScoreDetails } from '@/lib/scoring';
import { ExplainableScore } from '../ExplainableScore';

export function ImpactExplanation({
  result,
  breakdown,
  total,
}: {
  result: AiResult<ImpactAnalysis> | null;
  breakdown: ScoreDetails['breakdown'];
  total: number;
}) {
  return (
    <div className="space-y-4">
      <ExplainableScore total={total} breakdown={breakdown} />

      {result ? (
        <>
          <div className="flex items-center gap-2 pt-2">
            <Brain className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-white">{result.payload.contributor_role}</span>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{result.payload.explanation}</p>
          {result.payload.key_signals.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wide text-zinc-500 font-semibold mb-2 flex items-center gap-1.5">
                <Signal className="w-3.5 h-3.5 text-indigo-400" />
                Key Signals
              </h4>
              <div className="flex flex-wrap gap-2">
                {result.payload.key_signals.map((signal, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-zinc-300"
                  >
                    {signal}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-zinc-500">No AI impact analysis available yet.</p>
      )}
    </div>
  );
}

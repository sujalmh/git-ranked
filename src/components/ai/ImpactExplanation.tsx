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
  breakdown?: ScoreDetails['breakdown'];
  total?: number;
}) {
  return (
    <div className="space-y-5">
      {total !== undefined && breakdown !== undefined && (
        <ExplainableScore total={total} breakdown={breakdown} />
      )}

      {result ? (
        <>
          <div className="flex items-center gap-2 pt-2 mb-2">
            <Brain className="w-6 h-6 text-accent" />
            <span className="text-xl font-bold text-white uppercase tracking-wider">{result.payload.contributor_role}</span>
          </div>
          <p className="text-xl text-zinc-200 leading-relaxed border-l-2 border-accent/40 pl-4 font-medium">{result.payload.explanation}</p>
          {result.payload.key_signals.length > 0 && (
            <div className="pt-3">
              <h4 className="text-base uppercase tracking-wider font-bold mb-3 flex items-center gap-2 text-[#00bbff]">
                <Signal className="w-5 h-5" />
                Key Signals
              </h4>
              <div className="flex flex-wrap gap-2.5">
                {result.payload.key_signals.map((signal, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-[#00bbff]/10 border border-[#00bbff]/30 px-3.5 py-1.5 text-base font-semibold text-[#00bbff]"
                  >
                    {signal}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-base text-zinc-400">No AI impact analysis available yet.</p>
      )}
    </div>
  );
}

import { Sparkles } from 'lucide-react';
import type { AiResult } from '@/lib/ai/types';
import type { RepositorySummary } from '@/lib/ai/types';
import { ConfidenceBadge } from './ConfidenceBadge';

type Section = {
  key: keyof RepositorySummary;
  label: string;
};

const SECTIONS: Section[] = [
  { key: 'highlights', label: 'Highlights' },
  { key: 'completed_features', label: 'Completed Features' },
  { key: 'technical_changes', label: 'Technical Changes' },
  { key: 'risks', label: 'Risks' },
  { key: 'next_focus', label: 'Next Focus' },
];

export function StructuredSummary({ result }: { result: AiResult<RepositorySummary> }) {
  const { payload, confidence, source } = result;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-zinc-300 leading-relaxed text-sm">{payload.overview}</p>
        <ConfidenceBadge confidence={confidence} source={source} />
      </div>

      {SECTIONS.map(({ key, label }) => {
        const items = payload[key];
        if (!Array.isArray(items) || items.length === 0) return null;
        return (
          <div key={key}>
            <h4 className="text-xs uppercase tracking-wide text-zinc-500 font-semibold mb-2">{label}</h4>
            <ul className="space-y-1.5">
              {items.map((item, i) => (
                <li key={i} className="text-sm text-zinc-300 flex gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-purple-300 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

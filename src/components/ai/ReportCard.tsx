import { Sparkles } from 'lucide-react';
import type { AiResult, WeeklyReport, MonthlyReport } from '@/lib/ai/types';
import { ConfidenceBadge } from './ConfidenceBadge';

type ReportPayload = WeeklyReport | MonthlyReport;

const SECTIONS: Array<{ key: string; label: string }> = [
  { key: 'themes', label: 'Themes' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'risks', label: 'Risks' },
];

export function ReportCard({
  result,
  nextLabel,
}: {
  result: AiResult<WeeklyReport> | AiResult<MonthlyReport>;
  nextLabel: string;
}) {
  const { payload, confidence, source } = result as AiResult<ReportPayload>;
  const nextKey = nextLabel.toLowerCase().includes('week') ? 'next_week' : 'next_month';

  const getNextItems = (): string[] => {
    const val = (payload as Record<string, unknown>)[nextKey];
    return Array.isArray(val) ? (val as string[]) : [];
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-zinc-300 leading-relaxed text-sm">{payload.overview}</p>
        <ConfidenceBadge confidence={confidence} source={source} />
      </div>

      {SECTIONS.map(({ key, label }) => {
        const items = (payload as Record<string, unknown>)[key];
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

      {getNextItems().length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-wide text-zinc-500 font-semibold mb-2">{nextLabel}</h4>
          <ul className="space-y-1.5">
            {getNextItems().map((item, i) => (
              <li key={i} className="text-sm text-zinc-300 flex gap-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-300 mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export type { MonthlyReport };

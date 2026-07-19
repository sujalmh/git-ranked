import { Users, AlertTriangle, TrendingUp, Moon } from 'lucide-react';
import type { AiResult, TeamInsights } from '@/lib/ai/types';
import { ConfidenceBadge } from './ConfidenceBadge';

type Section = {
  key: keyof TeamInsights;
  label: string;
  icon: typeof Users;
  color: string;
  emptyText: string;
};

const SECTIONS: Section[] = [
  { key: 'review_bottlenecks', label: 'Review Bottlenecks', icon: AlertTriangle, color: 'text-amber-400', emptyText: 'No review bottlenecks detected.' },
  { key: 'single_owner_modules', label: 'Single-Owner Modules', icon: Users, color: 'text-red-400', emptyText: 'No single-owner risk detected.' },
  { key: 'rising_contributors', label: 'Rising Contributors', icon: TrendingUp, color: 'text-emerald-400', emptyText: 'No rising contributors in this period.' },
  { key: 'quiet_areas', label: 'Quiet Areas', icon: Moon, color: 'text-zinc-400', emptyText: 'No quiet areas detected.' },
];

export function TeamInsightsCard({ result }: { result: AiResult<TeamInsights> }) {
  const { payload, confidence, source } = result;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <ConfidenceBadge confidence={confidence} source={source} />
      </div>

      {SECTIONS.map(({ key, label, icon: Icon, color, emptyText }) => {
        const items = payload[key];
        return (
          <div key={key}>
            <h4 className="text-xs uppercase tracking-wide text-zinc-500 font-semibold mb-2 flex items-center gap-1.5">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              {label}
            </h4>
            {Array.isArray(items) && items.length > 0 ? (
              <ul className="space-y-1.5 ml-5">
                {items.map((item, i) => (
                  <li key={i} className="text-sm text-zinc-300 list-disc">{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500 ml-5">{emptyText}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

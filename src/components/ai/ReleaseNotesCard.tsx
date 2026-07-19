import { Rocket, Bug, TrendingUp, AlertTriangle, FileText } from 'lucide-react';
import type { AiResult, ReleaseNotes } from '@/lib/ai/types';
import { ConfidenceBadge } from './ConfidenceBadge';

type Section = {
  key: keyof Omit<ReleaseNotes, 'summary'>;
  label: string;
  icon: typeof Rocket;
  color: string;
};

const SECTIONS: Section[] = [
  { key: 'features', label: 'Features', icon: Rocket, color: 'text-emerald-400' },
  { key: 'fixes', label: 'Fixes', icon: Bug, color: 'text-red-400' },
  { key: 'improvements', label: 'Improvements', icon: TrendingUp, color: 'text-blue-400' },
  { key: 'breaking_changes', label: 'Breaking Changes', icon: AlertTriangle, color: 'text-amber-400' },
  { key: 'other', label: 'Other', icon: FileText, color: 'text-zinc-400' },
];

export function ReleaseNotesCard({ result }: { result: AiResult<ReleaseNotes> }) {
  const { payload, confidence, source } = result;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-zinc-300 leading-relaxed text-sm">{payload.summary}</p>
        <ConfidenceBadge confidence={confidence} source={source} />
      </div>

      {SECTIONS.map(({ key, label, icon: Icon, color }) => {
        const items = payload[key];
        if (!Array.isArray(items) || items.length === 0) return null;
        return (
          <div key={key}>
            <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <Icon className={`w-4 h-4 ${color}`} />
              {label}
            </h4>
            <ul className="space-y-1.5 ml-6">
              {items.map((item, i) => (
                <li key={i} className="text-sm text-zinc-300 list-disc">{item}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

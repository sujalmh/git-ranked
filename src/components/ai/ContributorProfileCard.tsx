import { CheckCircle2, AlertCircle, Target, Award } from 'lucide-react';
import type { AiResult, ContributorProfile } from '@/lib/ai/types';

type Section = {
  key: keyof Pick<ContributorProfile, 'strengths' | 'focus_areas' | 'accomplishments' | 'concerns'>;
  label: string;
  icon: typeof Award;
  color: string;
};

const SECTIONS: Section[] = [
  { key: 'strengths', label: 'Strengths', icon: Award, color: 'text-emerald-400' },
  { key: 'focus_areas', label: 'Focus Areas', icon: Target, color: 'text-indigo-400' },
  { key: 'accomplishments', label: 'Accomplishments', icon: CheckCircle2, color: 'text-purple-400' },
  { key: 'concerns', label: 'Concerns', icon: AlertCircle, color: 'text-amber-400' },
];

export function ContributorProfileCard({ result }: { result: AiResult<ContributorProfile> }) {
  const { payload } = result;

  return (
    <div className="space-y-5">
      <p className="text-zinc-300 leading-relaxed text-sm">{payload.summary}</p>

      {SECTIONS.map(({ key, label, icon: Icon, color }) => {
        const items = payload[key];
        if (!Array.isArray(items) || items.length === 0) return null;
        return (
          <div key={key}>
            <h4 className="text-xs uppercase tracking-wide text-zinc-500 font-semibold mb-2 flex items-center gap-1.5">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              {label}
            </h4>
            {key === 'focus_areas' ? (
              <div className="flex flex-wrap gap-2">
                {items.map((item, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-indigo-500/10 border border-indigo-500/30 px-3 py-1 text-xs text-indigo-300"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {items.map((item, i) => (
                  <li key={i} className="text-sm text-zinc-300 flex gap-2">
                    <Icon className={`w-3.5 h-3.5 ${color} mt-0.5 shrink-0`} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

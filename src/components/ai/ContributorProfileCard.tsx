import { CheckCircle2, AlertCircle, Target, Award } from 'lucide-react';
import type { AiResult, ContributorProfile } from '@/lib/ai/types';

type Section = {
  key: keyof Pick<ContributorProfile, 'strengths' | 'focus_areas' | 'accomplishments' | 'concerns'>;
  label: string;
  icon: typeof Award;
  color: string;
};

const SECTIONS: Section[] = [
  { key: 'strengths', label: 'Strengths', icon: Award, color: 'text-[#00ff66]' },
  { key: 'focus_areas', label: 'Focus Areas', icon: Target, color: 'text-[#00ffff]' },
  { key: 'accomplishments', label: 'Accomplishments', icon: CheckCircle2, color: 'text-[#ff00ff]' },
  { key: 'concerns', label: 'Concerns', icon: AlertCircle, color: 'text-[#ff3300]' },
];

export function ContributorProfileCard({ result }: { result: AiResult<ContributorProfile> }) {
  const { payload } = result;

  return (
    <div className="space-y-6">
      <p className="text-zinc-200 leading-relaxed text-lg font-medium">{payload.summary}</p>

      {SECTIONS.map(({ key, label, icon: Icon, color }) => {
        const items = payload[key];
        if (!Array.isArray(items) || items.length === 0) return null;
        return (
          <div key={key}>
            <h4 className={`text-base uppercase tracking-wider font-bold mb-3 flex items-center gap-2 ${color}`}>
              <Icon className="w-5 h-5" />
              {label}
            </h4>
            {key === 'focus_areas' ? (
              <div className="flex flex-wrap gap-2.5">
                {items.map((item, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-[#00ffff]/10 border border-[#00ffff]/30 px-3.5 py-1.5 text-base font-semibold text-[#00ffff]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : (
              <ul className="space-y-2.5">
                {items.map((item, i) => (
                  <li key={i} className="text-base md:text-lg text-zinc-200 font-medium flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 mt-2.5" />
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

import { Users, Zap, HeartPulse, Flame } from 'lucide-react';
import type { ContributorInsight } from '@/lib/contributor-insights';
import type { HealthMetrics } from '@/lib/insights';
import { SEVERITY, type Severity } from './identity';

function healthSeverity(score: number): Severity {
  if (score < 40) return 'risk';
  if (score < 70) return 'warning';
  return 'info';
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="bg-black border-b border-r border-white p-3 sm:p-5 flex items-center gap-2.5 sm:gap-5 transition-all">
      <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-400 font-bold leading-tight line-clamp-1">{label}</div>
        <div className="text-xl sm:text-3xl lg:text-4xl font-black text-white leading-tight whitespace-nowrap">{value}</div>
        {sub && <div className="text-[10px] sm:text-xs text-zinc-400 truncate mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export function StatsStrip({
  contributors,
  healthMetrics,
}: {
  contributors: ContributorInsight[];
  healthMetrics: HealthMetrics | null;
}) {
  const totalImpact = contributors.reduce((sum, c) => sum + c.impactScore, 0);
  const activeStreaks = contributors.filter((c) => c.currentStreak > 0).length;
  const health = healthMetrics?.overallScore ?? 0;
  const healthSev = healthSeverity(health);

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
      <StatCard
        icon={<Users className="w-5 h-5 sm:w-7 sm:h-7 text-[#00ffff]" />}
        label="Collaborators"
        value={String(contributors.length)}
        sub="ranked this period"
        accent="bg-[#00ffff]/10 border border-[#00ffff]/20"
      />
      <StatCard
        icon={<Zap className="w-5 h-5 sm:w-7 sm:h-7 text-[#ccff00]" />}
        label="Total Impact"
        value={totalImpact.toLocaleString()}
        sub="sum of impact scores"
        accent="bg-[#ccff00]/10 border border-[#ccff00]/20"
      />
      <StatCard
        icon={<HeartPulse className={`w-5 h-5 sm:w-7 sm:h-7 ${SEVERITY[healthSev].text}`} />}
        label="Team Health"
        value={`${health}/100`}
        sub={SEVERITY[healthSev].label.toLowerCase()}
        accent={`border ${SEVERITY[healthSev].chip}`}
      />
      <StatCard
        icon={<Flame className="w-5 h-5 sm:w-7 sm:h-7 text-[#ff5500]" />}
        label="Active Streaks"
        value={String(activeStreaks)}
        sub={activeStreaks === 1 ? 'contributor on a streak' : 'contributors on a streak'}
        accent="bg-[#ff5500]/10 border border-[#ff5500]/20"
      />
    </section>
  );
}

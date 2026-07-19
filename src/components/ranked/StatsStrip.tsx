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
    <div className="sleek-panel p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</div>
        <div className="text-xl font-black text-white leading-tight truncate">{value}</div>
        {sub && <div className="text-[10px] text-zinc-500 truncate">{sub}</div>}
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
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      <StatCard
        icon={<Users className="w-4 h-4 text-indigo-300" />}
        label="Collaborators"
        value={String(contributors.length)}
        sub="ranked this period"
        accent="bg-indigo-500/10 border border-indigo-500/20"
      />
      <StatCard
        icon={<Zap className="w-4 h-4 text-amber-300" />}
        label="Total Impact"
        value={totalImpact.toLocaleString()}
        sub="sum of impact scores"
        accent="bg-amber-500/10 border border-amber-500/20"
      />
      <StatCard
        icon={<HeartPulse className={`w-4 h-4 ${SEVERITY[healthSev].text}`} />}
        label="Team Health"
        value={`${health}/100`}
        sub={SEVERITY[healthSev].label.toLowerCase()}
        accent={`border ${SEVERITY[healthSev].chip}`}
      />
      <StatCard
        icon={<Flame className="w-4 h-4 text-orange-300" />}
        label="Active Streaks"
        value={String(activeStreaks)}
        sub={activeStreaks === 1 ? 'contributor on a streak' : 'contributors on a streak'}
        accent="bg-orange-500/10 border border-orange-500/20"
      />
    </section>
  );
}

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
    <div className="bg-black border-b border-r border-white p-5 flex items-center gap-5 transition-all">
      <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm uppercase tracking-wider text-zinc-500 font-bold">{label}</div>
        <div className="text-4xl font-black text-white leading-tight truncate">{value}</div>
        {sub && <div className="text-sm text-zinc-400 truncate mt-0.5">{sub}</div>}
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
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      <StatCard
        icon={<Users className="w-7 h-7 text-[#00ffff]" />}
        label="Collaborators"
        value={String(contributors.length)}
        sub="ranked this period"
        accent="bg-[#00ffff]/10 border border-[#00ffff]/20"
      />
      <StatCard
        icon={<Zap className="w-7 h-7 text-[#ccff00]" />}
        label="Total Impact"
        value={totalImpact.toLocaleString()}
        sub="sum of impact scores"
        accent="bg-[#ccff00]/10 border border-[#ccff00]/20"
      />
      <StatCard
        icon={<HeartPulse className={`w-7 h-7 ${SEVERITY[healthSev].text}`} />}
        label="Team Health"
        value={`${health}/100`}
        sub={SEVERITY[healthSev].label.toLowerCase()}
        accent={`border ${SEVERITY[healthSev].chip}`}
      />
      <StatCard
        icon={<Flame className="w-7 h-7 text-[#ff5500]" />}
        label="Active Streaks"
        value={String(activeStreaks)}
        sub={activeStreaks === 1 ? 'contributor on a streak' : 'contributors on a streak'}
        accent="bg-[#ff5500]/10 border border-[#ff5500]/20"
      />
    </section>
  );
}

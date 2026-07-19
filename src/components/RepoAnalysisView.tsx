import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Brain,
  Layers3,
  Sparkles,
  Trophy,
  Activity,
  BarChart,
  GitPullRequest,
} from 'lucide-react';
import { ActivityFeed } from '@/components/ActivityFeed';
import { HealthRadar } from '@/components/HealthRadar';
import { AiFindings } from '@/components/AiFindings';
import { ContributorAreas, type AreaContributor } from '@/components/ContributorAreas';
import { ContributorCard } from '@/components/ContributorCard';
import { CodeContributionDonut, type ContributionSlice } from '@/components/collaboration/CodeContributionDonut';
import { EvidenceProvider } from '@/components/evidence';
import { StructuredSummary, TeamInsightsCard } from '@/components/ai';
import type { RepoAnalysisData, ContributorAiData } from '@/lib/analysis';
import type { ContributorInsight } from '@/lib/contributor-insights';
import {
  buildEvidencePool,
  metricEvidence,
  toEvidenceItem,
  type HealthMetricKey,
  type MetricEvidence,
  type EvidenceItem,
} from '@/lib/evidence';
import type { HealthMetrics } from '@/lib/insights';

function ContributorAvatar({ src, username, size = 32 }: { src: string | null; username: string; size?: number }) {
  if (!src) return <div className="rounded-full bg-white/10 border border-white/10" style={{ width: size, height: size }} />;
  return <Image src={src} alt={`${username} avatar`} className="rounded-full border border-white/10" width={size} height={size} />;
}

function Standout({ label, contributor, detail }: { label: string; contributor: ContributorInsight; detail: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/5 p-4 flex items-center gap-3 h-full">
      <ContributorAvatar src={contributor.avatarUrl} username={contributor.username} size={36} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-0.5">{label}</div>
        <div className="text-sm font-semibold truncate">{contributor.username}</div>
        <div className="text-xs text-zinc-400 truncate">{detail}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-lg font-black text-indigo-400 leading-none">{contributor.impactScore}</div>
        <div className="text-[9px] uppercase text-zinc-500 tracking-wider">Impact</div>
      </div>
    </div>
  );
}

const METRIC_KEYS: HealthMetricKey[] = ['delivery', 'collaboration', 'codeQuality', 'reviewHealth', 'knowledgeDistribution'];

export function RepoAnalysisView({
  data,
  readOnly = false,
}: {
  data: RepoAnalysisData;
  readOnly?: boolean;
}) {
  const {
    contributors,
    activityFeed,
    topContributor,
    topReviewer,
    topFixer,
    repoSummaryResult,
    teamInsightsResult,
    healthMetrics,
    isAnalysed,
    contributorAiMap,
  } = data;

  if (contributors.length === 0) {
    return (
      <div className="glass-card p-8 text-center max-w-2xl mx-auto mt-12">
        <Sparkles className="w-9 h-9 text-indigo-300 mx-auto mb-3" />
        <h2 className="text-xl font-bold mb-2">No contribution story yet</h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-5 max-w-lg mx-auto">
          The app is installed, but GitRanked needs GitHub activity before it can build summaries, findings, and an impact timeline.
        </p>
        {!readOnly && (
          <Link href="/dashboard" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold text-sm">
            Back to repositories <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    );
  }

  if (!isAnalysed) {
    if (readOnly) {
      return (
        <div className="glass-card p-8 text-center max-w-2xl mx-auto mt-12 flex flex-col items-center">
          <Brain className="w-10 h-10 text-indigo-400 mb-3" />
          <h2 className="text-xl font-bold mb-2">Repository Insights Not Generated</h2>
          <p className="text-sm text-zinc-400 leading-relaxed mb-5 max-w-lg">
            The repository owner has not generated AI insights yet. Please check back later.
          </p>
        </div>
      );
    }
    return null;
  }

  const evidencePool = buildEvidencePool(contributors);
  const usernames = contributors.map((c) => c.username);
  const metricEvidenceList: MetricEvidence[] = healthMetrics
    ? METRIC_KEYS.map((k) => metricEvidence(k, (healthMetrics as HealthMetrics)[k], evidencePool))
    : [];
  const contributorEvidence: EvidenceItem[][] = contributors.map((c) =>
    c.events.map((ev) => toEvidenceItem(ev, c.username)).filter((e): e is EvidenceItem => e !== null)
  );
  const areaContributors: AreaContributor[] = contributors.slice(0, 8).map((c) => ({
    id: c.id,
    username: c.username,
    avatarUrl: c.avatarUrl,
    areas: c.categories.map((cat) => ({ label: cat.label, value: cat.value })),
  }));
  const risks = repoSummaryResult?.payload.risks ?? [];

  return (
    <EvidenceProvider>
      {/* 1. AI Summary and Health Radar */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-5 mb-6">
        <div className="glass-card p-6 overflow-hidden relative">
          <div className="absolute right-0 top-0 h-40 w-40 bg-indigo-500/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-purple-300 mb-3">
              <Brain className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">AI Repository Summary</span>
            </div>
            {repoSummaryResult ? (
              <StructuredSummary result={repoSummaryResult} />
            ) : (
              <p className="text-zinc-500 text-sm">No summary available.</p>
            )}
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center gap-2 text-green-300 mb-4">
            <Activity className="w-4 h-4" />
            <h2 className="text-base font-semibold text-white">Repository Health</h2>
          </div>
          {healthMetrics ? (
            <HealthRadar metrics={healthMetrics} metricEvidence={metricEvidenceList} />
          ) : (
            <div className="text-zinc-500 text-sm">Generating health metrics...</div>
          )}
        </div>
      </section>

      {/* 2. AI Findings (surfaced risks, bottlenecks, momentum) */}
      <section className="mb-6">
        <AiFindings
          teamInsights={teamInsightsResult?.payload ?? null}
          risks={risks}
          pool={evidencePool}
          usernames={usernames}
        />
      </section>

      {/* 3. Contributor Spotlight */}
      {(topContributor || topReviewer || topFixer) && (
        <section className="mb-6">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 text-pink-300 mb-4">
              <Trophy className="w-4 h-4" />
              <h2 className="text-base font-semibold text-white">Contributor Spotlight</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {topContributor && <Standout label="Highest impact" contributor={topContributor} detail={topContributor.role} />}
              {topReviewer && <Standout label="Review anchor" contributor={topReviewer} detail="Helped unblock teammates" />}
              {topFixer && <Standout label="Stability work" contributor={topFixer} detail="Most fixes / hardening signals" />}
            </div>
          </div>
        </section>
      )}

      {/* 4. Code Contribution Distribution */}
      {(() => {
        const slices: ContributionSlice[] = contributors
          .filter((c) => c.changedLines > 0)
          .slice()
          .sort((a, b) => b.changedLines - a.changedLines)
          .map((c) => ({
            username: c.username,
            avatarUrl: c.avatarUrl,
            additions: c.additions,
            deletions: c.deletions,
            changedLines: c.changedLines,
            prsMerged: c.prsMerged,
          }));

        if (slices.length === 0) return null;

        return (
          <section className="glass-card p-5 mb-6">
            <div className="flex items-center gap-2 mb-5">
              <GitPullRequest className="w-4 h-4 text-cyan-300" />
              <h2 className="text-base font-semibold text-white">Code Contribution</h2>
              <span className="text-xs text-zinc-500 ml-1">
                Share of all code changes (merged PRs)
              </span>
            </div>
            <CodeContributionDonut slices={slices} />
          </section>
        );
      })()}

      {/* 5. Contributors × Areas matrix + Activity Feed */}
      <section className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-5 mb-6">
        <ContributorAreas contributors={areaContributors} />
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers3 className="w-4 h-4 text-indigo-300" />
            <h2 className="text-base font-semibold">Activity Feed</h2>
          </div>
          <ActivityFeed items={activityFeed} />
        </div>
      </section>

      {/* 5. Team Insights (detailed) */}
      {teamInsightsResult && (
        <section className="glass-card p-5 mb-6">
          <div className="flex items-center gap-2 text-orange-300 mb-4">
            <BarChart className="w-4 h-4" />
            <h2 className="text-base font-semibold text-white">Team Insights</h2>
          </div>
          <TeamInsightsCard result={teamInsightsResult} />
        </section>
      )}

      {/* 6. Contributors */}
      <section className="glass-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart className="w-4 h-4 text-indigo-300" />
          <h2 className="text-base font-semibold">Contributors</h2>
          <span className="text-xs text-zinc-500 ml-1">Ranked by AI Impact Score</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {contributors.map((contributor, idx) => {
            const aiData: ContributorAiData | undefined = contributorAiMap.get(contributor.id);
            return (
              <ContributorCard
                key={contributor.id}
                contributor={contributor}
                aiData={{
                  profile: aiData?.profile ?? null,
                  impact: aiData?.impact ?? null,
                }}
                contributorEvidence={contributorEvidence[idx] ?? []}
              />
            );
          })}
        </div>
      </section>
    </EvidenceProvider>
  );
}

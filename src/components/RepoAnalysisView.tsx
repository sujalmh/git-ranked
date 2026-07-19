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
  Users,
  Network,
  Crown,
} from 'lucide-react';
import { ActivityFeed } from '@/components/ActivityFeed';
import { HealthRadar } from '@/components/HealthRadar';
import { AiFindings } from '@/components/AiFindings';
import { ContributorAreas, type AreaContributor } from '@/components/ContributorAreas';
import { ContributorCard } from '@/components/ContributorCard';
import { CodeContributionDonut, type ContributionSlice } from '@/components/collaboration/CodeContributionDonut';
import { CollaboratorLeaderboard } from '@/components/collaboration/CollaboratorLeaderboard';
import { CollaborationNetwork } from '@/components/collaboration/CollaborationNetwork';
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

function Standout({ label, contributor, detail, repoOwner, repoName }: { label: string; contributor: ContributorInsight; detail: string; repoOwner: string; repoName: string }) {
  return (
    <Link href={`/repos/${repoOwner}/${repoName}/${contributor.username}`} className="rounded-xl bg-white/5 border border-white/5 p-4 flex items-center gap-3 h-full hover:bg-white/10 transition-colors group">
      <div className="text-center shrink-0 w-7">
        {label.includes('impact') && <Crown className="w-5 h-5 text-amber-400 mx-auto" />}
        {label.includes('Review') && <Users className="w-5 h-5 text-blue-400 mx-auto" />}
        {label.includes('Stability') && <Trophy className="w-5 h-5 text-purple-400 mx-auto" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-0.5">{label}</div>
        <div className="text-sm font-semibold truncate">{contributor.username}</div>
        <div className="text-xs text-zinc-400 truncate">{detail}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-lg font-black text-indigo-400 leading-none group-hover:scale-110 transition-transform">{contributor.impactScore}</div>
        <div className="text-[9px] uppercase text-zinc-500 tracking-wider">Impact</div>
      </div>
    </Link>
  );
}

const METRIC_KEYS: HealthMetricKey[] = ['delivery', 'collaboration', 'codeQuality', 'reviewHealth', 'knowledgeDistribution'];

export function RepoAnalysisView({
  data,
  readOnly = false,
  repoOwner,
  repoName,
}: {
  data: RepoAnalysisData;
  readOnly?: boolean;
  repoOwner: string;
  repoName: string;
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
    reviewGraph,
  } = data;

  if (contributors.length === 0) {
    return (
      <div className="glass-card p-8 text-center max-w-2xl mx-auto mt-12">
        <Sparkles className="w-9 h-9 text-indigo-300 mx-auto mb-3" />
        <h2 className="text-xl font-bold mb-2">No contribution story yet</h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-5 max-w-lg mx-auto">
          The app is installed, but GitRanked needs GitHub activity before it can rank collaborators and build insights.
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
          <h2 className="text-xl font-bold mb-2">Collaborator Insights Not Generated</h2>
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

  return (
    <EvidenceProvider>
      {/* 1. COLLABORATOR LEADERBOARD — the hero */}
      <section className="glass-card p-5 mb-6 overflow-hidden relative">
        <div className="absolute right-0 top-0 h-40 w-40 bg-indigo-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Crown className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white">Collaborator Leaderboard</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-4">
            {contributors.length} collaborators ranked by impact score — velocity, reviews, code changes, and collaboration
          </p>
          <CollaboratorLeaderboard
            contributors={contributors}
            repoOwner={repoOwner}
            repoName={repoName}
          />
        </div>
      </section>

      {/* 2. Code Contribution + Collaboration Network side by side */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5 mb-6">
        {slices.length > 0 && (
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <GitPullRequest className="w-4 h-4 text-cyan-300" />
              <h2 className="text-base font-semibold text-white">Code Contribution</h2>
            </div>
            <CodeContributionDonut slices={slices} />
          </div>
        )}

        {reviewGraph.length > 0 && (
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Network className="w-4 h-4 text-indigo-300" />
              <h2 className="text-base font-semibold text-white">Collaboration Network</h2>
            </div>
            <CollaborationNetwork
              contributors={contributors}
              reviewGraph={reviewGraph}
            />
          </div>
        )}
      </section>

      {/* 3. Contributor Spotlight (top performers) */}
      {(topContributor || topReviewer || topFixer) && (
        <section className="mb-6">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 text-pink-300 mb-4">
              <Trophy className="w-4 h-4" />
              <h2 className="text-base font-semibold text-white">Top Performers</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {topContributor && <Standout label="Highest impact" contributor={topContributor} detail={topContributor.role} repoOwner={repoOwner} repoName={repoName} />}
              {topReviewer && <Standout label="Review anchor" contributor={topReviewer} detail="Helped unblock teammates" repoOwner={repoOwner} repoName={repoName} />}
              {topFixer && <Standout label="Stability work" contributor={topFixer} detail="Most fixes / hardening" repoOwner={repoOwner} repoName={repoName} />}
            </div>
          </div>
        </section>
      )}

      {/* 4. Detailed Contributor Cards */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-bold text-white">Contributor Profiles</h2>
          <span className="text-xs text-zinc-500 ml-1">Velocity, work mix, collaboration, and AI analysis</span>
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
                repoOwner={repoOwner}
                repoName={repoName}
              />
            );
          })}
        </div>
      </section>

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

      {/* 6. AI Repository Summary (secondary) */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-5 mb-6">
        <div className="glass-card p-6 overflow-hidden relative">
          <div className="absolute right-0 top-0 h-32 w-32 bg-purple-500/10 blur-3xl" />
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
            <h2 className="text-base font-semibold text-white">Health</h2>
          </div>
          {healthMetrics ? (
            <HealthRadar metrics={healthMetrics} metricEvidence={metricEvidenceList} />
          ) : (
            <div className="text-zinc-500 text-sm">Generating...</div>
          )}
        </div>
      </section>

      {/* 7. AI Findings + Team Insights (bottom, supplementary) */}
      <section className="mb-6">
        <AiFindings
          teamInsights={teamInsightsResult?.payload ?? null}
          risks={risks}
          pool={evidencePool}
          usernames={usernames}
        />
      </section>

      {teamInsightsResult && (
        <section className="glass-card p-5 mb-6">
          <div className="flex items-center gap-2 text-orange-300 mb-4">
            <BarChart className="w-4 h-4" />
            <h2 className="text-base font-semibold text-white">Team Insights</h2>
          </div>
          <TeamInsightsCard result={teamInsightsResult} />
        </section>
      )}
    </EvidenceProvider>
  );
}

'use client';

import React from 'react';
import {
  ArrowRight,
  Brain,
  Layers3,
  Sparkles,
  UsersRound,
  Crown,
  Activity,
} from 'lucide-react';
import Link from 'next/link';
import { ActivityFeed } from '@/components/ActivityFeed';
import { EvidenceProvider } from '@/components/evidence';
import {
  StatsStrip,
  Leaderboard,
  HealthCard,
  ContributorProfiles,
  WorkAreasHeatmap,
  AiInsights,
  assignIdentity,
  computeRiskHighlights,
  type RankDeltaMap,
  type HeatmapContributor,
} from '@/components/ranked';
import type { RepoAnalysisData } from '@/lib/analysis';
import type { HealthMetrics } from '@/lib/insights';
import {
  buildEvidencePool,
  metricEvidence,
  toEvidenceItem,
  type HealthMetricKey,
  type MetricEvidence,
  type EvidenceItem,
} from '@/lib/evidence';
import { ShareLeaderboardButton } from '@/components/ShareLeaderboardButton';

const METRIC_KEYS: HealthMetricKey[] = ['delivery', 'collaboration', 'codeQuality', 'reviewHealth', 'knowledgeDistribution'];

export function RepoAnalysisView({
  data,
  readOnly = false,
  repoOwner,
  repoName,
  rankDeltas = null,
}: {
  data: RepoAnalysisData;
  readOnly?: boolean;
  repoOwner: string;
  repoName: string;
  rankDeltas?: RankDeltaMap | null;
}) {

  const {
    contributors,
    activityFeed,
    repoSummaryResult,
    teamInsightsResult,
    healthMetrics,
    isAnalysed,
    contributorAiMap,
  } = data;

  if (contributors.length === 0) {
    return (
      <div className="sleek-panel p-8 text-center max-w-2xl mx-auto mt-12">
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
        <div className="sleek-panel p-8 text-center max-w-2xl mx-auto mt-12 flex flex-col items-center">
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

  const assignment = assignIdentity(contributors);
  const smallTeam = assignment.smallTeam;

  const evidencePool = buildEvidencePool(contributors);
  const usernames = contributors.map((c) => c.username);
  const metricEvidenceList: MetricEvidence[] = healthMetrics
    ? METRIC_KEYS.map((k) => metricEvidence(k, (healthMetrics as HealthMetrics)[k], evidencePool))
    : [];
  const contributorEvidence: EvidenceItem[][] = contributors.map((c) =>
    c.events.map((ev) => toEvidenceItem(ev, c.username)).filter((e): e is EvidenceItem => e !== null)
  );

  const heatmapContributors: HeatmapContributor[] = contributors.map((c) => ({
    id: c.id,
    username: c.username,
    avatarUrl: c.avatarUrl,
    areas: c.categories.map((cat) => ({ label: cat.label, value: cat.value })),
  }));

  const findingTexts: string[] = [
    ...(teamInsightsResult?.payload.single_owner_modules ?? []),
    ...(teamInsightsResult?.payload.review_bottlenecks ?? []),
    ...(repoSummaryResult?.payload.risks ?? []),
  ];
  const highlightByUser = computeRiskHighlights(contributors, findingTexts);
  const risks = repoSummaryResult?.payload.risks ?? [];

  return (
    <EvidenceProvider>
      {/* 1. Stats strip — large teams only */}
      {!smallTeam && healthMetrics && (
        <StatsStrip contributors={contributors} healthMetrics={healthMetrics} />
      )}

      {/* 2. Hero row: Leaderboard (60) + Health (40) */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5 mb-6 items-start">
        <div className="sleek-panel p-5">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <Crown className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl font-bold text-white">Leaderboard</h2>
              <span className="text-base text-zinc-300 ml-2">
                {smallTeam
                  ? `${contributors.length} collaborators · ranked by impact`
                  : `Top 3 of ${contributors.length} · ranked by impact`}
              </span>
            </div>
            <ShareLeaderboardButton
              repoOwner={repoOwner}
              repoName={repoName}
              contributors={contributors}
            />
          </div>
          <p className="text-base text-zinc-300 mb-5">
            {smallTeam
              ? 'Impact breakdown bar shows shipping, quality, reviews, collaboration and consistency.'
              : 'Search and sort the full list below the podium.'}
          </p>
          <Leaderboard
            contributors={contributors}
            assignment={assignment}
            rankDeltas={rankDeltas}
            repoOwner={repoOwner}
            repoName={repoName}
          />
        </div>

        <div className="flex flex-col gap-5 w-full">
          <div className="sleek-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-6 h-6 text-emerald-300" />
              <h2 className="text-xl font-bold text-white">Team Health</h2>
              <span className="text-base text-zinc-400 ml-auto">/100</span>
            </div>
            {healthMetrics ? (
              <HealthCard metrics={healthMetrics} metricEvidence={metricEvidenceList} />
            ) : (
              <div className="text-zinc-500 text-sm">Generating…</div>
            )}
          </div>

          {/* 5. Activity feed moved to hero right column */}
          <div className="sleek-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <Layers3 className="w-6 h-6 text-indigo-300" />
              <h2 className="text-xl font-bold text-white">Activity Feed</h2>
              <span className="text-base text-zinc-300 ml-2">most recent first</span>
            </div>
            <ActivityFeed items={activityFeed} identityColors={assignment.hexByUsername} />
          </div>
        </div>
      </section>

      {/* 3. Contributor profiles */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <UsersRound className="w-6 h-6 text-indigo-400" />
          <h2 className="text-xl font-bold text-white">Contributor Profiles</h2>
          <span className="text-base text-zinc-300 ml-2">
            {smallTeam ? 'Stat tiles + AI work summary' : `Top ${Math.min(contributors.length, 9)} of ${contributors.length} — open a profile for full detail`}
          </span>
        </div>
        <ContributorProfiles
          contributors={smallTeam ? contributors : contributors.slice(0, 9)}
          contributorAiMap={contributorAiMap}
          contributorEvidence={contributorEvidence}
          repoOwner={repoOwner}
          repoName={repoName}
          assignment={assignment}
          highlightByUser={highlightByUser}
        />
      </section>

      {/* 4. Work areas heatmap */}
      <section className="mb-6">
        <WorkAreasHeatmap contributors={heatmapContributors} smallTeam={smallTeam} />
      </section>


      {/* 6. AI insights — single merged section */}
      <section className="mb-6">
        <AiInsights
          overview={repoSummaryResult?.payload.overview ?? null}
          summary={repoSummaryResult?.payload ?? null}
          teamInsights={teamInsightsResult?.payload ?? null}
          risks={risks}
          pool={evidencePool}
          usernames={usernames}
          smallTeam={smallTeam}
        />
      </section>
    </EvidenceProvider>
  );
}

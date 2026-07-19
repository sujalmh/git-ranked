import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Brain,
  GitBranch,
  Layers3,
  Sparkles,
  Trophy,
  Zap,
  Activity,
  BarChart,
  Users
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { computeContributionScore, type ClassificationMap } from '@/lib/scoring';
import { backfillRepoActivity } from '@/lib/github-backfill';
import { ActivityFeed, ActivityItem } from '@/components/ActivityFeed';
import { HealthRadar } from '@/components/HealthRadar';
import { getRepoInsights } from '@/lib/insights';
import { runTaskById, getCachedContributorResults } from '@/lib/ai';
import type { AiResult, ContributorProfile, ImpactAnalysis, RepositorySummary, TeamInsights } from '@/lib/ai/types';
import { AnalyseButton } from '@/components/AnalyseButton';
import { StructuredSummary, TeamInsightsCard, ContributorProfileCard, ImpactExplanation } from '@/components/ai';
import {
  asNumber,
  asPayload,
  buildContributionCategories,
  contributorRole,
  contributorSummary,
  describeEvent,
  eventCategory,
  eventDate,
  formatRelativeDate,
  isFix,
  topBy,
  type ContributorInsight,
  type Highlight,
} from '@/lib/contributor-insights';
import type { ClassificationItem } from '@/lib/ai/types';

type RepoEventRow = {
  id: number;
  type: string;
  payload: Record<string, unknown> | string | null;
  created_at: Date | string;
  contributor_id: number;
  username: string;
  avatar_url: string | null;
  classification?: unknown;
};

function buildContributorInsights(rows: RepoEventRow[]) {
  const contributors = new Map<number, ContributorInsight>();
  const categoryCountsByContributor = new Map<number, Map<string, number>>();
  const highlights: Highlight[] = [];
  const activityItems: ActivityItem[] = [];
  const classifications: ClassificationMap = new Map();

  for (const row of rows) {
    if (row.classification && typeof row.classification === 'object') {
      classifications.set(row.id, row.classification as ClassificationItem);
    }
  }

  for (const row of rows) {
    const payload = asPayload(row.payload);
    const createdAt = eventDate(row.created_at);
    const existing = contributors.get(row.contributor_id);
    const contributor = existing ?? {
      id: row.contributor_id,
      username: row.username,
      avatarUrl: row.avatar_url,
      score: { total: 0, breakdown: { featureDelivery: 0, codeQuality: 0, reviews: 0, collaboration: 0, consistency: 0 } },
      impactScore: 0,
      commits: 0,
      prsOpened: 0,
      prsMerged: 0,
      reviews: 0,
      issues: 0,
      releases: 0,
      fixes: 0,
      changedLines: 0,
      lastActive: null,
      role: 'Contributor',
      summary: [],
      categories: [],
      highlights: [],
      events: [],
    };

    if (row.type === 'push') contributor.commits += asNumber(payload.commit_count);
    if (row.type === 'pr_opened') contributor.prsOpened += 1;
    if (row.type === 'pr_merged') {
      contributor.prsMerged += 1;
      contributor.changedLines += asNumber(payload.additions) + asNumber(payload.deletions);
    }
    if (row.type === 'review_submitted') contributor.reviews += 1;
    if (row.type.startsWith('issue_')) contributor.issues += 1;
    if (row.type === 'release') contributor.releases += 1;
    if (isFix(row.type, payload)) contributor.fixes += 1;

    const category = eventCategory(row.type, payload);
    const categoryCounts = categoryCountsByContributor.get(row.contributor_id) ?? new Map<string, number>();
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    categoryCountsByContributor.set(row.contributor_id, categoryCounts);

    if (!contributor.lastActive || createdAt > contributor.lastActive) contributor.lastActive = createdAt;
    contributor.events.push({ id: row.id, type: row.type, payload, created_at: createdAt.toISOString() });

    const highlightText = describeEvent(row.type, payload);
    contributor.highlights.push(highlightText);
    highlights.push({ date: createdAt, username: row.username, text: highlightText });
    
    // Only add meaningful events to activity feed
    if (row.type !== 'push') {
      activityItems.push({
        id: `${row.type}-${createdAt.getTime()}-${row.username}`,
        type: row.type,
        actor: row.username,
        avatarUrl: row.avatar_url,
        message: highlightText,
        date: createdAt
      });
    }

    contributors.set(row.contributor_id, contributor);
  }

  const scored = Array.from(contributors.values()).map(contributor => ({
    ...contributor,
    score: computeContributionScore(contributor.events, { classifications }),
  }));
  const topScore = Math.max(...scored.map(contributor => contributor.score.total), 1);

  const ranked = scored.map(contributor => {
    const nextContributor = {
      ...contributor,
      impactScore: Math.max(1, Math.round((contributor.score.total / topScore) * 100)),
    };
    return {
      ...nextContributor,
      role: contributorRole(nextContributor),
      summary: contributorSummary(nextContributor),
      categories: buildContributionCategories(nextContributor, categoryCountsByContributor.get(contributor.id) ?? new Map()),
      highlights: contributor.highlights.slice(0, 3),
    };
  }).sort((a, b) => b.impactScore - a.impactScore);

  return {
    contributors: ranked,
    highlights: highlights.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 8),
    activityFeed: activityItems.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 20),
  };
}

function ContributorAvatar({ src, username, size = 40 }: { src: string | null; username: string; size?: number }) {
  if (!src) return <div className="rounded-full bg-white/10 border border-white/10" style={{ width: size, height: size }} />;
  return <Image src={src} alt={`${username} avatar`} className="rounded-full border border-white/10" width={size} height={size} />;
}

type ContributorAiData = {
  profile: AiResult<ContributorProfile> | null;
  impact: AiResult<ImpactAnalysis> | null;
};

export default async function RepoAnalysisBoard(
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { owner, name } = params;

  const repoQuery = await sql`
    SELECT r.id, r.github_repo_id, r.default_branch, i.github_installation_id
    FROM repositories r
    JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name} AND i.linked_user_id = ${session.user.id}
  `;

  if (repoQuery.length === 0) return <div>Repository not found or access denied.</div>;

  const repoId = repoQuery[0].id;
  let eventsQuery = (await sql`
    SELECT e.id, e.event_type as type, e.payload, e.created_at, e.classification,
           c.id as contributor_id, c.username, c.avatar_url
    FROM github_events e
    JOIN github_contributors c ON e.contributor_id = c.id
    WHERE e.repo_id = ${repoId}
    ORDER BY e.created_at DESC
  `) as RepoEventRow[];

  if (eventsQuery.length === 0) {
    await backfillRepoActivity({
      id: repoQuery[0].id,
      github_installation_id: repoQuery[0].github_installation_id,
      owner,
      name,
    });

    eventsQuery = (await sql`
      SELECT e.id, e.event_type as type, e.payload, e.created_at, e.classification,
             c.id as contributor_id, c.username, c.avatar_url
      FROM github_events e
      JOIN github_contributors c ON e.contributor_id = c.id
      WHERE e.repo_id = ${repoId}
      ORDER BY e.created_at DESC
    `) as RepoEventRow[];
  }

  const { contributors, highlights, activityFeed } = buildContributorInsights(eventsQuery);
  const topContributor = contributors[0];
  const topReviewer = topBy(contributors, contributor => contributor.reviews);
  const topFixer = topBy(contributors, contributor => contributor.fixes);
  
  // Fetch AI Summaries and Health Metrics
  const dateTo = new Date().toISOString().split('T')[0];
  // eslint-disable-next-line react-hooks/purity
  const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  let repoSummaryResult: AiResult<RepositorySummary> | null = null;
  let teamInsightsResult: AiResult<TeamInsights> | null = null;
  try {
    repoSummaryResult = await runTaskById('repository_summary', repoId, dateFrom, dateTo) as AiResult<RepositorySummary> | null;
    teamInsightsResult = await runTaskById('team_insights', repoId, dateFrom, dateTo) as AiResult<TeamInsights> | null;
  } catch (err) {
    console.error("AI Generation failed", err);
  }

  const healthMetrics = await getRepoInsights(repoId, false);
  const isAnalysed = repoSummaryResult !== null && teamInsightsResult !== null && healthMetrics !== null;

  // Fetch cached AI results for all contributors
  const contributorIds = contributors.map(c => c.id);
  const contributorAiData = await getCachedContributorResults(repoId, contributorIds);
  const contributorAiMap = new Map<number, ContributorAiData>();
  for (const [id, data] of contributorAiData) {
    contributorAiMap.set(id, {
      profile: data.profile as AiResult<ContributorProfile> | null,
      impact: data.impact as AiResult<ImpactAnalysis> | null,
    });
  }

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 mt-8">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3 text-sm text-zinc-400 mb-3">
              <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
              <span>/</span>
              <span>{owner}</span>
            </div>
            <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
              <GitBranch className="w-8 h-8 text-indigo-400" />
              {owner} / {name}
            </h1>
            <p className="text-zinc-400 max-w-2xl">
              AI Engineering Intelligence: Understand what shipped, where bottlenecks are, and how your team collaborates.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <AnalyseButton owner={owner} name={name} isReanalyse={isAnalysed} />
            <Link href={`/repos/${owner}/${name}/releases`} className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors px-4 py-2 text-sm text-white font-medium">
              Release Notes
            </Link>
            <Link href={`/repos/${owner}/${name}/compare`} className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors px-4 py-2 text-sm text-white font-medium">
              Compare Team
            </Link>
          </div>
        </div>

        {contributors.length === 0 ? (
          <div className="glass-card p-10 text-center max-w-3xl mx-auto mt-20">
            <Sparkles className="w-10 h-10 text-indigo-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-3">No contribution story yet</h2>
            <p className="text-zinc-400 leading-relaxed mb-6">
              The app is installed, but GitRanked needs GitHub activity before it can build summaries, categories, highlights, and an impact timeline.
            </p>
            <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold">
              Back to repositories <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : !isAnalysed ? (
          <div className="glass-card p-10 text-center max-w-3xl mx-auto mt-20 flex flex-col items-center">
            <Brain className="w-12 h-12 text-indigo-400 mb-4" />
            <h2 className="text-2xl font-bold mb-3">Repository Insights Not Generated</h2>
            <p className="text-zinc-400 leading-relaxed mb-6">
              This repository has contribution data, but the AI insights have not been generated yet. Click below to crunch the data and generate comprehensive health metrics, team summaries, and AI impact scores.
            </p>
            <AnalyseButton owner={owner} name={name} />
          </div>
        ) : (
          <>
            {/* 1 & 2. AI Summary and Repo Health */}
            <section className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-6 mb-10">
              <div className="glass-card p-8 overflow-hidden relative">
                <div className="absolute right-0 top-0 h-48 w-48 bg-indigo-500/20 blur-3xl" />
                <div className="relative">
                  <div className="flex items-center gap-2 text-purple-300 mb-4">
                    <Brain className="w-5 h-5" />
                    <span className="text-sm font-semibold uppercase tracking-wide">AI Repository Summary</span>
                  </div>
                  {repoSummaryResult ? (
                    <StructuredSummary result={repoSummaryResult} />
                  ) : (
                    <p className="text-zinc-500 text-sm">No summary available.</p>
                  )}
                </div>
              </div>

              <div className="glass-card p-6">
                <div className="flex items-center gap-2 text-green-300 mb-5">
                  <Activity className="w-5 h-5" />
                  <h2 className="text-xl font-bold text-white">Repository Health</h2>
                </div>
                {healthMetrics ? (
                  <HealthRadar metrics={healthMetrics} />
                ) : (
                  <div className="text-zinc-500">Generating health metrics...</div>
                )}
              </div>
            </section>

            {/* 3 & 4. Highlights and Spotlights */}
            <section className="grid grid-cols-1 xl:grid-cols-[0.6fr_1.4fr] gap-6 mb-10">
              <div className="glass-card p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Zap className="w-5 h-5 text-yellow-300" />
                  <div>
                    <h2 className="text-xl font-bold">Weekly Highlights</h2>
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  {highlights.map((highlight, index) => (
                    <div key={`${highlight.username}-${highlight.date.toISOString()}-${index}`} className="border-l border-yellow-500/30 pl-4 py-1">
                      <div className="text-sm font-semibold text-white">{highlight.username}</div>
                      <p className="text-sm text-zinc-300 leading-relaxed">{highlight.text}</p>
                      <div className="text-xs text-zinc-500 mt-1">{formatRelativeDate(highlight.date)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card p-6">
                <div className="flex items-center gap-2 text-pink-300 mb-5">
                  <Trophy className="w-5 h-5" />
                  <h2 className="text-xl font-bold text-white">Contributor Spotlight</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Standout label="Highest impact" contributor={topContributor} detail={topContributor.role} />
                  {topReviewer && <Standout label="Review anchor" contributor={topReviewer} detail="Helped unblock teammates" />}
                  {topFixer && <Standout label="Stability work" contributor={topFixer} detail="Most fixes / hardening signals" />}
                </div>
              </div>
            </section>

            {/* 5 & 6. Activity Feed and Team Insights */}
            <section className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6 mb-10">
              <div className="glass-card p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Layers3 className="w-5 h-5 text-indigo-300" />
                  <div>
                    <h2 className="text-xl font-bold">Activity Feed</h2>
                    <p className="text-sm text-zinc-400">Meaningful events, filtered for noise.</p>
                  </div>
                </div>
                <ActivityFeed items={activityFeed} />
              </div>

              <div className="glass-card p-6">
                <div className="flex items-center gap-2 text-orange-300 mb-5">
                  <Users className="w-5 h-5" />
                  <h2 className="text-xl font-bold text-white">Team Insights</h2>
                </div>
                {teamInsightsResult ? (
                  <TeamInsightsCard result={teamInsightsResult} />
                ) : (
                  <p className="text-zinc-500 text-sm">No team insights available.</p>
                )}
              </div>
            </section>

            {/* 7. Contributors */}
            <section className="glass-card p-6 mb-10">
              <div className="flex items-center gap-2 mb-6">
                <BarChart className="w-5 h-5 text-indigo-300" />
                <div>
                  <h2 className="text-xl font-bold">Contributors</h2>
                  <p className="text-sm text-zinc-400">Ranked by AI Impact Score.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {contributors.map(contributor => {
                  const aiData = contributorAiMap.get(contributor.id);
                  return (
                    <div key={contributor.id} className="rounded-2xl border border-white/5 bg-white/5 p-5">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <ContributorAvatar src={contributor.avatarUrl} username={contributor.username} size={44} />
                          <div className="min-w-0">
                            <h3 className="font-bold truncate">{contributor.username}</h3>
                            <p className="text-xs text-zinc-500">{contributor.role} · {formatRelativeDate(contributor.lastActive)}</p>
                          </div>
                        </div>
                        <ImpactExplanation
                          result={aiData?.impact ?? null}
                          breakdown={contributor.score.breakdown}
                          total={contributor.impactScore}
                        />
                      </div>

                      {aiData?.profile ? (
                        <ContributorProfileCard result={aiData.profile} />
                      ) : (
                        <>
                          <ul className="space-y-2 mb-4">
                            {contributor.summary.slice(0, 3).map(item => (
                              <li key={item} className="text-sm text-zinc-300 flex gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-purple-300 mt-1 shrink-0" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>

                          <div className="flex flex-wrap gap-2">
                            {contributor.categories.map(category => (
                              <span key={category.label} className="rounded-full bg-black/25 border border-white/10 px-3 py-1 text-xs text-zinc-300" title={category.detail}>
                                {category.label}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Standout({ label, contributor, detail }: { label: string; contributor: ContributorInsight; detail: string }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/5 p-4 flex flex-col justify-between h-full">
      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-4">{label}</div>
        <div className="flex items-center gap-3 mb-2">
          <ContributorAvatar src={contributor.avatarUrl} username={contributor.username} size={36} />
          <div className="min-w-0">
            <div className="font-bold truncate">{contributor.username}</div>
            <div className="text-xs text-zinc-400 truncate">{detail}</div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <div className="text-2xl font-black text-indigo-400">{contributor.impactScore} <span className="text-xs font-normal text-zinc-500 uppercase">Impact</span></div>
      </div>
    </div>
  );
}

import { sql } from './db';
import { type ClassificationMap } from './scoring';
import { getRepoInsights } from './insights';
import { runTaskById, getCachedContributorResults } from './ai';
import type { AiResult, ContributorProfile, ImpactAnalysis, RepositorySummary, TeamInsights, ClassificationItem } from './ai/types';
import {
  asNumber,
  asPayload,
  buildContributionCategories,
  contributorRole,
  contributorSummary,
  describeEvent,
  eventDate,
  extractAreasFromWorkUnit,
  formatRelativeDate,
  isFix,
  topBy,
  workAreasForEvent,
  type ContributorInsight,
  type Highlight,
} from './contributor-insights';
import type { ActivityItem } from '@/components/ActivityFeed';
import { computeCollaborationAnalytics } from './collaboration-analytics';

export type RepoEventRow = {
  id: number;
  type: string;
  payload: Record<string, unknown> | string | null;
  created_at: Date | string;
  contributor_id: number;
  username: string;
  avatar_url: string | null;
  classification?: unknown;
  diff_facts?: unknown;
};

export type ContributorAiData = {
  profile: AiResult<ContributorProfile> | null;
  impact: AiResult<ImpactAnalysis> | null;
};

export type RepoAnalysisData = {
  contributors: ContributorInsight[];
  highlights: Highlight[];
  activityFeed: ActivityItem[];
  topContributor: ContributorInsight | undefined;
  topReviewer: ContributorInsight | undefined;
  topFixer: ContributorInsight | undefined;
  repoSummaryResult: AiResult<RepositorySummary> | null;
  teamInsightsResult: AiResult<TeamInsights> | null;
  healthMetrics: Awaited<ReturnType<typeof getRepoInsights>>;
  isAnalysed: boolean;
  contributorAiMap: Map<number, ContributorAiData>;
  reviewGraph: Array<{ reviewerId: number; reviewer: string; authorId: number; author: string; count: number }>;
};

export function parseDiffFacts(raw: unknown): { directories?: string[] } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const dirs = obj.directories;
  if (!Array.isArray(dirs)) return undefined;
  return { directories: dirs.filter((d): d is string => typeof d === 'string') };
}

export function buildContributorInsights(rows: RepoEventRow[]) {
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
      additions: 0,
      deletions: 0,
      lastActive: null,
      role: 'Contributor',
      summary: [],
      categories: [],
      highlights: [],
      events: [],
      velocity: [],
      velocityLabels: [],
      currentStreak: 0,
      longestStreak: 0,
      collaborationScore: 0,
      workDistribution: {},
      reviewedByCount: 0,
      reviewedOthersCount: 0,
      collaborators: [],
    };

    if (row.type === 'push') contributor.commits += asNumber(payload.commit_count);
    if (row.type === 'pr_opened') contributor.prsOpened += 1;
    if (row.type === 'pr_merged') {
      contributor.prsMerged += 1;
      const add = asNumber(payload.additions);
      const del = asNumber(payload.deletions);
      contributor.changedLines += add + del;
      contributor.additions += add;
      contributor.deletions += del;
    }
    if (row.type === 'review_submitted') contributor.reviews += 1;
    if (row.type.startsWith('issue_')) contributor.issues += 1;
    if (row.type === 'release') contributor.releases += 1;
    if (isFix(row.type, payload)) contributor.fixes += 1;

    const areas = workAreasForEvent(row.type, payload, classifications.get(row.id), parseDiffFacts(row.diff_facts));
    const categoryCounts = categoryCountsByContributor.get(row.contributor_id) ?? new Map<string, number>();
    for (const area of areas) {
      categoryCounts.set(area, (categoryCounts.get(area) ?? 0) + 1);
    }
    categoryCountsByContributor.set(row.contributor_id, categoryCounts);

    if (!contributor.lastActive || createdAt > contributor.lastActive) contributor.lastActive = createdAt;
    contributor.events.push({
      id: row.id,
      event_type: row.type,
      type: row.type,
      payload,
      created_at: createdAt.toISOString(),
      contributor_id: row.contributor_id,
      username: row.username,
    });

    const highlightText = describeEvent(row.type, payload);
    contributor.highlights.push(highlightText);
    highlights.push({ date: createdAt, username: row.username, text: highlightText });

    activityItems.push({
      id: `${row.type}-${createdAt.getTime()}-${row.username}-${row.id}`,
      type: row.type,
      actor: row.username,
      avatarUrl: row.avatar_url,
      message: highlightText,
      date: createdAt,
    });

    contributors.set(row.contributor_id, contributor);
  }

  const scored = Array.from(contributors.values()).map(contributor => {
    const featureDelivery = contributor.prsMerged * 15 + contributor.commits * 2;
    const codeQuality = contributor.fixes * 10;
    const reviews = contributor.reviews * 10;
    const collaboration = contributor.issues * 5 + contributor.releases * 10;
    const consistency = Math.min(50, contributor.events.length * 2);
    const total = featureDelivery + codeQuality + reviews + collaboration + consistency;

    return {
      ...contributor,
      score: {
        total,
        breakdown: { featureDelivery, codeQuality, reviews, collaboration, consistency },
      },
    };
  });

  const ranked = scored.map(contributor => {
    const nextContributor = {
      ...contributor,
      impactScore: Math.max(1, Math.min(100, Math.round(contributor.score.total))),
    };
    return {
      ...nextContributor,
      role: contributorRole(nextContributor),
      summary: contributorSummary(nextContributor),
      categories: buildContributionCategories(nextContributor, categoryCountsByContributor.get(contributor.id) ?? new Map()),
      highlights: contributor.highlights.slice(0, 3),
    };
  }).sort((a, b) => b.impactScore - a.impactScore);

  const collabStats = computeCollaborationAnalytics(
    rows.map(r => ({
      id: r.id,
      event_type: r.type,
      payload: asPayload(r.payload),
      created_at: r.created_at,
      contributor_id: r.contributor_id,
      username: r.username,
      classification: r.classification,
      diff_facts: r.diff_facts,
    }))
  );
  const collabMap = new Map(collabStats.contributors.map(c => [c.contributorId, c]));
  const merged = ranked.map(c => {
    const cs = collabMap.get(c.id);
    if (!cs) return c;
    return {
      ...c,
      velocity: cs.velocity,
      velocityLabels: cs.velocityLabels,
      currentStreak: cs.currentStreak,
      longestStreak: cs.longestStreak,
      collaborationScore: cs.collaborationScore,
      workDistribution: cs.workDistribution,
      reviewedByCount: cs.reviewedByCount,
      reviewedOthersCount: cs.reviewedOthersCount,
      collaborators: cs.collaborators,
    };
  });

  return {
    contributors: merged,
    highlights: highlights.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 8),
    activityFeed: activityItems.sort((a, b) => b.date.getTime() - a.date.getTime()),
    reviewGraph: collabStats.reviewGraph,
  };
}

export async function fetchRepoEvents(repoId: number): Promise<RepoEventRow[]> {
  return (await sql`
    SELECT e.id, e.event_type as type, e.payload, e.created_at, e.classification, e.diff_facts,
           c.id as contributor_id, c.username, c.avatar_url
    FROM github_events e
    JOIN github_contributors c ON e.contributor_id = c.id
    WHERE e.repo_id = ${repoId}
      AND c.username NOT ILIKE '%[bot]%'
    ORDER BY e.created_at DESC
  `) as RepoEventRow[];
}

export async function getRepoAnalysisData(repoId: number): Promise<RepoAnalysisData> {
  const eventsQuery = await fetchRepoEvents(repoId);
  const { contributors: rawContributors, highlights, activityFeed, reviewGraph } = buildContributorInsights(eventsQuery);

  // Fetch v3 dimension scores
  let dimensionRows = await sql`
    SELECT contributor_id, decay_profile, impact, quality, collaboration, consistency, composite,
           window_start, window_end, scoring_config_version, computed_at
    FROM dimension_scores
    WHERE repo_id = ${repoId}
  `;

  if (dimensionRows.length === 0) {
    const { scoreRepo } = await import('./scoring');
    const computed = await scoreRepo(repoId);
    dimensionRows = computed as unknown as typeof dimensionRows;
  }

  const dimMap = new Map<number, { current?: any; all_time?: any }>();
  for (const row of dimensionRows) {
    const cid = row.contributor_id as number;
    const existing = dimMap.get(cid) ?? {};
    if (row.decay_profile === 'current') existing.current = row;
    else existing.all_time = row;
    dimMap.set(cid, existing);
  }

  const contributors = rawContributors.map((c) => {
    const ds = dimMap.get(c.id);
    if (!ds?.current) return c;
    const currentComp = Math.max(1, Math.min(100, Math.round(ds.current.composite)));
    return {
      ...c,
      impactScore: currentComp,
      dimensionScores: ds,
      score: {
        total: currentComp,
        breakdown: {
          featureDelivery: ds.current.impact,
          codeQuality: ds.current.quality,
          reviews: ds.current.collaboration,
          collaboration: ds.current.collaboration,
          consistency: ds.current.consistency,
        },
      },
    };
  }).sort((a, b) => b.impactScore - a.impactScore);

  const topContributor = contributors[0];
  const topReviewer = topBy(contributors, contributor => contributor.reviews);
  const topFixer = topBy(contributors, contributor => contributor.fixes);

  const dateTo = new Date().toISOString().split('T')[0];
  const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let repoSummaryResult: AiResult<RepositorySummary> | null = null;
  let teamInsightsResult: AiResult<TeamInsights> | null = null;
  try {
    repoSummaryResult = await runTaskById('repository_summary', repoId, dateFrom, dateTo) as AiResult<RepositorySummary> | null;
    teamInsightsResult = await runTaskById('team_insights', repoId, dateFrom, dateTo) as AiResult<TeamInsights> | null;
  } catch (err) {
    console.error('AI Generation failed', err);
  }

  const healthMetrics = await getRepoInsights(repoId, true);
  const isAnalysed = repoSummaryResult !== null && teamInsightsResult !== null && healthMetrics !== null;

  const contributorIds = contributors.map(c => c.id);
  const contributorAiData = await getCachedContributorResults(repoId, contributorIds);
  const contributorAiMap = new Map<number, ContributorAiData>();
  for (const [id, data] of contributorAiData) {
    contributorAiMap.set(id, {
      profile: data.profile as AiResult<ContributorProfile> | null,
      impact: data.impact as AiResult<ImpactAnalysis> | null,
    });
  }

  // Fetch shipped work units for each contributor and extract specific work domain areas
  // so the WorkAreasHeatmap reflects detailed extracted work areas rather than generic type buckets.
  const workUnitRows = await sql`
    SELECT 
      wuc.contributor_id, 
      wu.work_type, 
      wu.summary, 
      wu.facts
    FROM work_units wu
    JOIN work_unit_contributors wuc ON wu.id = wuc.work_unit_id
    WHERE wu.repo_id = ${repoId}
      AND wu.shipped = true
  `;

  // Build a map: contributorId -> { areaLabel -> count }
  const areaCountsByContributor = new Map<number, Map<string, number>>();
  for (const row of workUnitRows) {
    const cid = row.contributor_id as number;
    const summary = row.summary as string | null;
    const workType = row.work_type as string;
    const facts = row.facts as Record<string, unknown> | null;

    const areas = extractAreasFromWorkUnit(summary, workType, facts);
    const existingMap = areaCountsByContributor.get(cid) ?? new Map<string, number>();

    for (const area of areas) {
      existingMap.set(area, (existingMap.get(area) ?? 0) + 1);
    }
    areaCountsByContributor.set(cid, existingMap);
  }

  const GENERIC_LABELS = new Set(['Other', 'Feature', 'BugFix', 'Refactor', 'Feature Work', 'Maintenance']);

  // Enrich contributors: prefer specific work unit extracted areas over generic event buckets
  const enrichedContributors = contributors.map((c) => {
    const areaMap = areaCountsByContributor.get(c.id);
    if (!areaMap || areaMap.size === 0) return c;

    const wuCategories = Array.from(areaMap.entries())
      .map(([label, value]) => ({ label, value, detail: `${value} shipped work unit${value !== 1 ? 's' : ''}` }))
      .sort((a, b) => b.value - a.value);

    // Filter out generic labels like "Feature" or "Refactor" if specific area tags exist
    const specificWu = wuCategories.filter((cat) => !GENERIC_LABELS.has(cat.label));
    const finalWu = specificWu.length > 0 ? specificWu : wuCategories;

    // Combine with existing non-generic event categories
    const existingCats = (c.categories ?? []).filter((cat) => !GENERIC_LABELS.has(cat.label));
    const mergedLabels = new Set(finalWu.map((cat) => cat.label));
    const newCats = existingCats.filter((cat) => !mergedLabels.has(cat.label));

    const categories = [...finalWu, ...newCats].slice(0, 6);

    return { ...c, categories };
  });

  return {
    contributors: enrichedContributors,
    highlights,
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
  };
}

export { formatRelativeDate };

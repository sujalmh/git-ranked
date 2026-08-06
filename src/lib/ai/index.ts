import { sql } from '../db';
import { runTask, getCachedResult } from './runner';
import { classifyEvents } from './tasks/work-classification';
import { contributorProfileTask } from './tasks/contributor-profile';
import { repositorySummaryTask } from './tasks/repository-summary';
import { impactAnalysisTask } from './tasks/impact-analysis';
import { teamInsightsTask } from './tasks/team-insights';
import { weeklyReportTask } from './tasks/weekly-report';
import { monthlyReportTask } from './tasks/monthly-report';
import {
  buildEventContextBlock,
  computeContributorStats,
  fetchEvents,
  normalizeEvents,
} from './context';
import type { AiResult, AiTask, TaskContext } from './types';

export const tasks = {
  contributorProfile: contributorProfileTask,
  repositorySummary: repositorySummaryTask,
  impactAnalysis: impactAnalysisTask,
  teamInsights: teamInsightsTask,
  weeklyReport: weeklyReportTask,
  monthlyReport: monthlyReportTask,
} as const;

export type TaskId = keyof typeof tasks;

const TASK_BY_ID: Record<string, AiTask<unknown>> = {
  contributor_profile: contributorProfileTask as AiTask<unknown>,
  repository_summary: repositorySummaryTask as AiTask<unknown>,
  impact_analysis: impactAnalysisTask as AiTask<unknown>,
  team_insights: teamInsightsTask as AiTask<unknown>,
  weekly_report: weeklyReportTask as AiTask<unknown>,
  monthly_report: monthlyReportTask as AiTask<unknown>,
};

export async function getRepoContext(repoId: number): Promise<{ owner: string; name: string } | null> {
  const rows = await sql`
    SELECT owner, name FROM repositories WHERE id = ${repoId}
  `;
  return rows.length > 0 ? { owner: rows[0].owner, name: rows[0].name } : null;
}

export async function buildTaskContext(
  repoId: number,
  repoOwner: string,
  repoName: string,
  dateFrom: string,
  dateTo: string,
  contributorId?: number,
  contributorUsername?: string,
): Promise<TaskContext> {
  const eventRows = await fetchEvents(repoId, dateFrom, dateTo, contributorId);
  const events = await normalizeEvents(repoId, repoOwner, repoName, eventRows);

  const stats = computeContributorStats(events);

  let scoreBreakdown: TaskContext['scoreBreakdown'] | undefined;
  if (contributorId) {
    // Score the contributor from the stored v3 dimension scores so the
    // breakdown handed to the AI matches the Impact Score displayed on the
    // contributor's card (getRepoAnalysisData reads the same table). Before
    // this, a hardcoded breakdown was sent, so the AI described a score that
    // did not match the page.
    const scoreRows = await sql`
      SELECT impact, quality, collaboration, consistency, composite
      FROM dimension_scores
      WHERE repo_id = ${repoId} AND contributor_id = ${contributorId}
        AND decay_profile = 'current'
      ORDER BY computed_at DESC
      LIMIT 1
    `;

    if (scoreRows.length > 0) {
      const s = scoreRows[0];
      scoreBreakdown = {
        total: Math.max(1, Math.min(100, Math.round(Number(s.composite)))),
        breakdown: {
          featureDelivery: Math.round(Number(s.impact)),
          codeQuality: Math.round(Number(s.quality)),
          reviews: Math.round(Number(s.collaboration)),
          collaboration: Math.round(Number(s.collaboration)),
          consistency: Math.round(Number(s.consistency)),
        },
      };
    }
  }

  return {
    repoId,
    repoOwner,
    repoName,
    dateFrom,
    dateTo,
    contributorId,
    contributorUsername,
    events,
    contributorStats: stats,
    scoreBreakdown,
  };
}

import type { AiCallOptions } from './openrouter';

export async function getOrGenerateTask<T>(
  task: AiTask<T>,
  ctx: TaskContext,
  generateIfMissing: boolean,
  aiOptions?: AiCallOptions
): Promise<AiResult<T> | null> {
  return runTask(task, ctx, { generateIfMissing, aiOptions });
}

async function getCachedResultPublic(
  task: AiTask<unknown>,
  repoId: number,
  dateFrom: string,
  dateTo: string,
  contributorId?: number
): Promise<AiResult<unknown> | null> {
  return getCachedResult(task, repoId, dateFrom, dateTo, contributorId);
}

export async function runTaskById(
  taskId: string,
  repoId: number,
  dateFrom: string,
  dateTo: string,
  contributorId?: number,
  generateIfMissing = false
): Promise<AiResult<unknown> | null> {
  const task = TASK_BY_ID[taskId];
  if (!task) {
    throw new Error(`Unknown AI task: ${taskId}`);
  }

  // Check cache FIRST — avoids building context (which triggers GitHub API
  // diff-fact fetches) when we only need a cached read.
  const cached = await getCachedResultPublic(task, repoId, dateFrom, dateTo, contributorId);
  if (cached) return cached;

  if (!generateIfMissing) return null;

  // Cache miss + generate requested: build the full context (fetches events,
  // diff facts, etc.) and run the task.
  const repoInfo = await getRepoContext(repoId);
  if (!repoInfo) throw new Error(`Repository ${repoId} not found`);

  let contributorUsername: string | undefined;
  if (contributorId) {
    const rows = await sql`SELECT username FROM github_contributors WHERE id = ${contributorId}`;
    if (rows.length > 0) contributorUsername = rows[0].username;
  }

  const ctx = await buildTaskContext(
    repoId,
    repoInfo.owner,
    repoInfo.name,
    dateFrom,
    dateTo,
    contributorId,
    contributorUsername,
  );

  return runTask(task, ctx, { generateIfMissing });
}

export { classifyEvents };
export { fetchEvents, normalizeEvents, buildEventContextBlock };
export type { AiResult, AiTask, TaskContext };
export type { ContributorProfile, RepositorySummary, ImpactAnalysis, TeamInsights, WeeklyReport, MonthlyReport, Classification, ClassificationItem, NormalizedEvent, DiffFacts } from './types';

export async function getCachedContributorResults(
  repoId: number,
  contributorIds: number[]
): Promise<Map<number, { profile: AiResult<unknown> | null; impact: AiResult<unknown> | null }>> {
  const result = new Map<number, { profile: AiResult<unknown> | null; impact: AiResult<unknown> | null }>();

  if (contributorIds.length === 0) return result;

  const rows = await sql`
    SELECT contributor_id, insight_type, payload, confidence, source, generated_at
    FROM insight_caches
    WHERE repo_id = ${repoId}
      AND contributor_id = ANY(${contributorIds}::integer[])
      AND insight_type IN ('contributor_profile', 'impact_analysis')
      AND payload IS NOT NULL
    ORDER BY generated_at DESC
  `;

  for (const id of contributorIds) {
    result.set(id, { profile: null, impact: null });
  }

  for (const row of rows) {
    const entry = result.get(row.contributor_id as number);
    if (!entry) continue;

    const aiResult: AiResult<unknown> = {
      payload: row.payload,
      confidence: typeof row.confidence === 'number' ? row.confidence : 0.5,
      source: (row.source as 'ai' | 'fallback') ?? 'ai',
      modelUsed: 'cached',
      generatedAt: new Date(row.generated_at as string),
    };

    if (row.insight_type === 'contributor_profile' && !entry.profile) {
      entry.profile = aiResult;
    } else if (row.insight_type === 'impact_analysis' && !entry.impact) {
      entry.impact = aiResult;
    }
  }

  return result;
}

const LEGACY_TASK_MAP: Record<string, string> = {
  weekly: 'repository_summary',
  team_insights: 'team_insights',
  areas_of_contribution: 'contributor_profile',
};

function legacyResultToText(taskId: string, payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const obj = payload as Record<string, unknown>;

  if (taskId === 'areas_of_contribution') {
    const focusAreas = obj.focus_areas;
    return Array.isArray(focusAreas) ? focusAreas.join(', ') : '';
  }

  const lines: string[] = [];
  const overview = obj.overview ?? obj.summary;
  if (typeof overview === 'string' && overview) lines.push(overview);

  for (const [key, label] of [
    ['highlights', 'Highlights'],
    ['completed_features', 'Completed Features'],
    ['technical_changes', 'Technical Changes'],
    ['risks', 'Risks'],
    ['next_focus', 'Next Focus'],
    ['features', 'Features'],
    ['fixes', 'Fixes'],
    ['improvements', 'Improvements'],
    ['breaking_changes', 'Breaking Changes'],
    ['review_bottlenecks', 'Review Bottlenecks'],
    ['single_owner_modules', 'Single-Owner Modules'],
    ['rising_contributors', 'Rising Contributors'],
    ['quiet_areas', 'Quiet Areas'],
    ['strengths', 'Strengths'],
    ['focus_areas', 'Focus Areas'],
    ['accomplishments', 'Accomplishments'],
    ['concerns', 'Concerns'],
    ['themes', 'Themes'],
    ['shipped', 'Shipped'],
    ['next_week', 'Next Week'],
    ['next_month', 'Next Month'],
  ] as Array<[string, string]>) {
    const val = obj[key];
    if (Array.isArray(val) && val.length) {
      lines.push(`\n${label}:`);
      for (const item of val) lines.push(`• ${item}`);
    }
  }

  return lines.join('\n');
}

export async function generateSummary(
  repoId: number,
  summaryType: string,
  dateFrom: string,
  dateTo: string,
  contributorId?: number,
  generateIfMissing = false
): Promise<string | null> {
  const taskId = LEGACY_TASK_MAP[summaryType] ?? 'repository_summary';
  const result = await runTaskById(taskId, repoId, dateFrom, dateTo, contributorId, generateIfMissing);
  if (!result) return null;
  return legacyResultToText(taskId, result.payload);
}

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { generateRepoInsights } from '@/lib/insights';
import { scoreRepo } from '@/lib/scoring';
import {
  buildTaskContext,
  classifyEvents,
  getOrGenerateTask,
  getRepoContext,
  tasks,
} from '@/lib/ai';
import { setTelemetryListener, type ApiTelemetryEvent } from '@/lib/ai/telemetry';
import { getUserAiConfig } from '@/lib/ai/openrouter';
import { getRepoAnalysisPeriod } from '@/lib/analysis';
import { consumeDailySlot } from '@/lib/rate-limit';
import { enqueueClassifyRepo } from '@/lib/queue';
import { getUserRepoId } from '@/lib/repo-access';

type ProgressEvent = {
  step: string;
  status: 'running' | 'done' | 'error' | 'complete' | 'info';
  message: string;
  detail?: unknown;
};

const encoder = new TextEncoder();

function encodeEvent(event: ProgressEvent): Uint8Array {
  return encoder.encode(JSON.stringify(event) + '\n');
}

export async function POST(
  req: Request,
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { owner, name } = await props.params;

  const repoId = await getUserRepoId(owner, name, session.user.id);
  if (repoId === null) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
  }

  const repoInfo = await getRepoContext(repoId);
  if (!repoInfo) {
    return NextResponse.json({ error: 'Repository metadata not found' }, { status: 404 });
  }

  const userId = Number(session.user.id);
  const userAiConfig = await getUserAiConfig(userId);

  // Daily analysis rate limit: one analysis (or re-analysis) per account per day.
  const limit = await consumeDailySlot(`analysis:${userId}`, 1);
  if (!limit.allowed) {
    const retryAfterSeconds = Math.max(1, Math.round(limit.retryAfterMs / 1000));
    return NextResponse.json(
      { error: 'Daily analysis limit reached. You can run one analysis per day — try again tomorrow.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
    );
  }

  // Mode: 'cache' (default) reuses cached AI summaries/work units where present;
  // 'fresh' clears caches and forces a full re-extraction + regeneration.
  let mode: 'cache' | 'fresh' = 'cache';
  try {
    const body = (await req.json()) as { mode?: string };
    mode = body?.mode === 'fresh' ? 'fresh' : 'cache';
  } catch {
    // No/invalid body — default to cache mode
  }

  if (mode === 'fresh') {
    // Clear AI summary caches (repo + contributor level) and reset work-unit
    // candidates so a fresh run regenerates everything with the current model.
    await sql`DELETE FROM ai_summaries WHERE repo_id = ${repoId}`;
    await sql`
      DELETE FROM insight_caches
      WHERE repo_id = ${repoId}
        AND insight_type IN ('contributor_profile', 'impact_analysis', 'team_insights', 'repository_summary')
    `;
    await sql`
      UPDATE work_unit_candidates
      SET status = 'needs_reclassification'
      WHERE repo_id = ${repoId}
    `;
    // Repo-scoped classification cache: clearing it forces the worker to re-run
    // the model on every candidate instead of reusing cached extractions.
    await sql`DELETE FROM classification_cache WHERE repo_id = ${repoId}`;
  }

  const period = await getRepoAnalysisPeriod(repoId);
  const dateTo = period.dateTo;
  const dateFrom = period.dateFrom;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const listener = (event: ApiTelemetryEvent) => {
        const statusMap: Record<string, ProgressEvent['status']> = {
          api_request: 'running',
          api_response: 'done',
          api_error: 'error',
        };
        controller.enqueue(
          encodeEvent({
            step: event.task || event.provider,
            status: statusMap[event.type] || 'info',
            message: event.summary,
            detail: {
              provider: event.provider,
              endpoint: event.endpoint,
              model: event.model,
              task: event.task,
              status: event.status,
              latencyMs: event.latencyMs,
            },
          })
        );
      };

      setTelemetryListener(listener);
      try {
        controller.enqueue(
          encodeEvent({
            step: 'init',
            status: 'info',
            message: `Initializing pipeline for ${repoInfo.owner}/${repoInfo.name} (Repo ID: ${repoId}, mode: ${mode})`,
          })
        );

        const steps: Array<{ step: string; message: string; fn: () => Promise<unknown> }> = [
          {
            step: 'classifying',
            message: 'Classifying unclassified events',
            fn: () => classifyEvents(repoId, repoInfo.owner, repoInfo.name, undefined, undefined, undefined, userAiConfig),
          },
          {
            step: 'goal_tree',
            message: 'Building repo goal tree',
            fn: async () => {
              const { buildRepoGoalTree } = await import('@/lib/scoring/goals');
              const tree = await buildRepoGoalTree(repoId, userAiConfig);
              return { treeBuilt: Boolean(tree), purpose: tree?.purpose ?? '' };
            },
          },
          {
            step: 'work_units',
            message: 'Extracting work units from events',
            fn: async () => {
              const jobId = await enqueueClassifyRepo(repoId, userId);

              controller.enqueue(
                encodeEvent({
                  step: 'work_units',
                  status: 'running',
                  message: 'Enqueued work unit classification job',
                  detail: { jobId },
                })
              );

              const startTime = Date.now();
              // Vercel serverless streaming functions are duration-capped
              // (60s hobby / 300s pro). The classify job runs in the background
              // worker regardless; cap the synchronous wait so the function is
              // not killed mid-stream, and tell the client to poll /status.
              const TIMEOUT_MS = 4 * 60 * 1000;

              while (true) {
                if (Date.now() - startTime > TIMEOUT_MS) {
                  throw new Error(
                    `Classification job ${jobId} is still running in the background — check progress on the repo page`
                  );
                }

                const rows = await sql<{
                  job_id: string;
                  status: string;
                  done: number;
                  total: number;
                  result_units: number | null;
                  error: string | null;
                }>`
                  SELECT job_id, status, done, total, result_units, error
                  FROM job_progress
                  WHERE job_id = ${jobId}
                `;

                if (rows.length > 0) {
                  const job = rows[0];
                  const done = Number(job.done || 0);
                  const total = Number(job.total || 0);

                  controller.enqueue(
                    encodeEvent({
                      step: 'work_units',
                      status: 'running',
                      message: `Extracting work units: ${done}/${total}`,
                      detail: { jobId, done, total, status: job.status },
                    })
                  );

                  if (job.status === 'completed') {
                    return { jobId, totalUnits: job.result_units ?? 0, done, total };
                  }

                  if (job.status === 'failed') {
                    throw new Error(job.error || `Classification job ${jobId} failed`);
                  }
                }

                await new Promise((r) => setTimeout(r, 1500));
              }
            },
          },
          {
            step: 'scoring',
            message: 'Computing contributor dimension scores',
            fn: () => scoreRepo(repoId),
          },
          {
            step: 'health_metrics',
            message: 'Computing repository health metrics',
            fn: () => generateRepoInsights(repoId),
          },
          {
            step: 'repository_summary',
            message: 'Generating AI repository summary',
            fn: async () => {
              const ctx = await buildTaskContext(repoId, repoInfo.owner, repoInfo.name, dateFrom, dateTo);
              return getOrGenerateTask(tasks.repositorySummary, ctx, true, userAiConfig);
            },
          },
          {
            step: 'team_insights',
            message: 'Generating AI team insights',
            fn: async () => {
              const ctx = await buildTaskContext(repoId, repoInfo.owner, repoInfo.name, dateFrom, dateTo);
              return getOrGenerateTask(tasks.teamInsights, ctx, true, userAiConfig);
            },
          },
          {
            step: 'contributor_profiles',
            message: 'Profiling top contributors',
            fn: async () => {
              const topContributors = await sql`
                SELECT c.id, c.username
                FROM github_contributors c
                JOIN github_events e ON e.contributor_id = c.id
                WHERE e.repo_id = ${repoId}
                  AND e.created_at >= ${dateFrom}::date
                  AND e.created_at < ${dateTo}::date + INTERVAL '1 day'
                  AND c.username NOT ILIKE '%[bot]%'
                GROUP BY c.id, c.username
                ORDER BY COUNT(e.id) DESC
                LIMIT 5
              `;
              for (const contributor of topContributors) {
                const ctx = await buildTaskContext(
                  repoId,
                  repoInfo.owner,
                  repoInfo.name,
                  dateFrom,
                  dateTo,
                  contributor.id,
                  contributor.username
                );
                await getOrGenerateTask(tasks.contributorProfile, ctx, true, userAiConfig);
              }
              return { count: topContributors.length };
            },
          },
          {
            step: 'impact_analysis',
            message: 'Analyzing contributor impact',
            fn: async () => {
              const topContributors = await sql`
                SELECT c.id, c.username
                FROM github_contributors c
                JOIN github_events e ON e.contributor_id = c.id
                WHERE e.repo_id = ${repoId}
                  AND e.created_at >= ${dateFrom}::date
                  AND e.created_at < ${dateTo}::date + INTERVAL '1 day'
                  AND c.username NOT ILIKE '%[bot]%'
                GROUP BY c.id, c.username
                ORDER BY COUNT(e.id) DESC
                LIMIT 5
              `;
              for (const contributor of topContributors) {
                const ctx = await buildTaskContext(
                  repoId,
                  repoInfo.owner,
                  repoInfo.name,
                  dateFrom,
                  dateTo,
                  contributor.id,
                  contributor.username
                );
                await getOrGenerateTask(tasks.impactAnalysis, ctx, true, userAiConfig);
              }
              return { count: topContributors.length };
            },
          },
        ];

        for (const { step, message, fn } of steps) {
          controller.enqueue(encodeEvent({ step, status: 'running', message }));
          try {
            const detail = await fn();
            controller.enqueue(encodeEvent({ step, status: 'done', message: `${message} — complete`, detail }));
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            controller.enqueue(encodeEvent({ step, status: 'error', message: `${message} — failed: ${errMsg}` }));
          }
        }

        controller.enqueue(encodeEvent({ step: 'analysis', status: 'complete', message: 'Analysis complete' }));
        controller.close();
      } finally {
        setTelemetryListener(null);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  });
}

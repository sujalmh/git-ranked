import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { generateRepoInsights } from '@/lib/insights';
import {
  buildTaskContext,
  classifyEvents,
  getOrGenerateTask,
  getRepoContext,
  tasks,
} from '@/lib/ai';

type ProgressEvent = {
  step: string;
  status: 'running' | 'done' | 'error' | 'complete';
  message: string;
  detail?: unknown;
};

const encoder = new TextEncoder();

function encodeEvent(event: ProgressEvent): Uint8Array {
  return encoder.encode(JSON.stringify(event) + '\n');
}

export async function POST(
  _req: Request,
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { owner, name } = await props.params;

  const repoQuery = await sql`
    SELECT r.id
    FROM repositories r
    LEFT JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name} 
      AND (i.linked_user_id = ${session.user.id} OR r.installation_id IS NULL)
  `;

  if (repoQuery.length === 0) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
  }

  const repoId = repoQuery[0].id;
  const repoInfo = await getRepoContext(repoId);
  if (!repoInfo) {
    return NextResponse.json({ error: 'Repository metadata not found' }, { status: 404 });
  }

  const dateTo = new Date().toISOString().split('T')[0];
  const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const steps: Array<{ step: string; message: string; fn: () => Promise<unknown> }> = [
        {
          step: 'classifying',
          message: 'Classifying unclassified events',
          fn: () => classifyEvents(repoId, repoInfo.owner, repoInfo.name),
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
            return getOrGenerateTask(tasks.repositorySummary, ctx, true);
          },
        },
        {
          step: 'team_insights',
          message: 'Generating AI team insights',
          fn: async () => {
            const ctx = await buildTaskContext(repoId, repoInfo.owner, repoInfo.name, dateFrom, dateTo);
            return getOrGenerateTask(tasks.teamInsights, ctx, true);
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
              await getOrGenerateTask(tasks.contributorProfile, ctx, true);
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
              await getOrGenerateTask(tasks.impactAnalysis, ctx, true);
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

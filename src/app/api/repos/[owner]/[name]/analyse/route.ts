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

export async function POST(
  _req: Request,
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { owner, name } = await props.params;

  try {
    const repoQuery = await sql`
      SELECT r.id
      FROM repositories r
      JOIN installations i ON r.installation_id = i.id
      WHERE r.owner = ${owner} AND r.name = ${name} AND i.linked_user_id = ${session.user.id}
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

    // 1. Classify unclassified events from the last 90 days (lazy, batched)
    const classificationResult = await classifyEvents(repoId, repoInfo.owner, repoInfo.name);

    // 2. Refresh deterministic health metrics
    await generateRepoInsights(repoId);

    // 3. Generate repo-scoped summaries (forced)
    const repoCtx = await buildTaskContext(repoId, repoInfo.owner, repoInfo.name, dateFrom, dateTo);
    await getOrGenerateTask(tasks.repositorySummary, repoCtx, true);
    await getOrGenerateTask(tasks.teamInsights, repoCtx, true);

    // 4. Generate contributor profiles + impact analysis for top contributors
    const topContributors = await sql`
      SELECT c.id, c.username
      FROM github_contributors c
      JOIN github_events e ON e.contributor_id = c.id
      WHERE e.repo_id = ${repoId}
        AND e.created_at >= ${dateFrom}::date
        AND e.created_at < ${dateTo}::date + INTERVAL '1 day'
      GROUP BY c.id, c.username
      ORDER BY COUNT(e.id) DESC
      LIMIT 5
    `;

    for (const contributor of topContributors) {
      const contributorCtx = await buildTaskContext(
        repoId,
        repoInfo.owner,
        repoInfo.name,
        dateFrom,
        dateTo,
        contributor.id,
        contributor.username
      );
      await getOrGenerateTask(tasks.contributorProfile, contributorCtx, true);
      await getOrGenerateTask(tasks.impactAnalysis, contributorCtx, true);
    }

    return NextResponse.json({
      success: true,
      classification: classificationResult,
      contributorsProcessed: topContributors.length,
    });
  } catch (err) {
    console.error('Analyse Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

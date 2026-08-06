import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { runTaskById } from '@/lib/ai';
import { isRepoOwnedByUser } from '@/lib/repo-access';

const VALID_TASKS = [
  'contributor_profile',
  'repository_summary',
  'impact_analysis',
  'team_insights',
  'weekly_report',
  'monthly_report',
] as const;

function isValidDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { repoId, dateFrom, dateTo, contributorId } = body;
    const task = body.task || body.summaryType || 'repository_summary';
    const generate = body.generate !== false;

    const parsedRepoId = Number(repoId);
    const parsedContributorId = contributorId ? Number(contributorId) : undefined;
    const dateFromTime = Date.parse(dateFrom);
    const dateToTime = Date.parse(dateTo);

    if (!Number.isInteger(parsedRepoId) || parsedRepoId <= 0 || !isValidDate(dateFrom) || !isValidDate(dateTo)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (Number.isNaN(dateFromTime) || Number.isNaN(dateToTime) || dateFromTime > dateToTime) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    }

    if (parsedContributorId !== undefined && (!Number.isInteger(parsedContributorId) || parsedContributorId <= 0)) {
      return NextResponse.json({ error: 'Invalid contributorId' }, { status: 400 });
    }

    if (!VALID_TASKS.includes(task)) {
      return NextResponse.json({ error: `Invalid task. Valid tasks: ${VALID_TASKS.join(', ')}` }, { status: 400 });
    }

    const owned = await isRepoOwnedByUser(parsedRepoId, session.user.id);
    if (!owned) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    if (parsedContributorId !== undefined) {
      const contributorAccess = await sql`
        SELECT id
        FROM github_events
        WHERE repo_id = ${parsedRepoId}
          AND contributor_id = ${parsedContributorId}
        LIMIT 1
      `;

      if (contributorAccess.length === 0) {
        return NextResponse.json({ error: 'Contributor not found for repository' }, { status: 404 });
      }
    }

    const result = await runTaskById(
      task,
      parsedRepoId,
      dateFrom,
      dateTo,
      parsedContributorId,
      generate
    );

    if (!result) {
      return NextResponse.json({ result: null });
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error('Summarize API Error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}

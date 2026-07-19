import { NextResponse } from 'next/server';
import { generateSummary } from '../../../../lib/ai';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

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

    const repoAccess = await sql`
      SELECT r.id
      FROM repositories r
      JOIN installations i ON r.installation_id = i.id
      WHERE r.id = ${parsedRepoId}
        AND i.linked_user_id = ${session.user.id}
        AND r.is_active = true
      LIMIT 1
    `;

    if (repoAccess.length === 0) {
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

    const summaryType = body.summaryType || 'weekly';
    const summary = await generateSummary(parsedRepoId, summaryType, dateFrom, dateTo, parsedContributorId);
    
    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Summarize API Error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}

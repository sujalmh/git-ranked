import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { generateRepoInsights } from '@/lib/insights';
import { generateSummary } from '@/lib/ai';

export async function POST(
  req: Request,
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

    // Trigger analysis
    await generateRepoInsights(repoId);

    const dateTo = new Date().toISOString().split('T')[0];
    const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Force generate summaries (weekly and team_insights)
    await generateSummary(repoId, 'weekly', dateFrom, dateTo, undefined, true);
    await generateSummary(repoId, 'team_insights', dateFrom, dateTo, undefined, true);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Analyse Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

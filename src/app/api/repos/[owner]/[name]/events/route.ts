import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  const { owner, name } = await params;
  
  const { searchParams } = new URL(req.url);
  const contributorId = searchParams.get('contributorId');

  try {
    const repoQuery = await sql`SELECT id FROM repositories WHERE owner = ${owner} AND name = ${name}`;
    if (repoQuery.length === 0) return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
    const repoId = repoQuery[0].id;

    let events;
    if (contributorId) {
      events = await sql`
        SELECT e.id, e.event_type, e.payload, e.created_at, c.username, c.avatar_url
        FROM github_events e
        JOIN github_contributors c ON e.contributor_id = c.id
        WHERE e.repo_id = ${repoId} AND e.contributor_id = ${contributorId}
        ORDER BY e.created_at DESC
        LIMIT 100
      `;
    } else {
      events = await sql`
        SELECT e.id, e.event_type, e.payload, e.created_at, c.username, c.avatar_url
        FROM github_events e
        JOIN github_contributors c ON e.contributor_id = c.id
        WHERE e.repo_id = ${repoId}
        ORDER BY e.created_at DESC
        LIMIT 100
      `;
    }

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Failed to fetch events:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

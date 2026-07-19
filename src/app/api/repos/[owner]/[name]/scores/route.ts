import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { computeContributionScore, RawEvent } from '@/lib/scoring';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  const { owner, name } = await params;
  
  try {
    // 1. Get Repo ID
    const repoQuery = await sql`SELECT id FROM repositories WHERE owner = ${owner} AND name = ${name}`;
    if (repoQuery.length === 0) return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
    const repoId = repoQuery[0].id;

    // 2. Fetch all events for this repo
    const eventsQuery = await sql`
      SELECT e.event_type as type, e.payload, e.created_at, c.id as contributor_id, c.username, c.avatar_url
      FROM github_events e
      JOIN github_contributors c ON e.contributor_id = c.id
      WHERE e.repo_id = ${repoId}
    `;

    // 3. Group by contributor and compute scores
    const contributorEvents: Record<number, { 
      contributor: any, 
      events: RawEvent[] 
    }> = {};

    for (const row of eventsQuery) {
      if (!contributorEvents[row.contributor_id]) {
        contributorEvents[row.contributor_id] = {
          contributor: {
            id: row.contributor_id,
            username: row.username,
            avatar_url: row.avatar_url,
          },
          events: []
        };
      }
      contributorEvents[row.contributor_id].events.push({
        type: row.type,
        payload: row.payload,
        created_at: row.created_at.toISOString()
      });
    }

    const scores = Object.values(contributorEvents).map(({ contributor, events }) => {
      const scoreDetails = computeContributionScore(events);
      return {
        contributor,
        score: scoreDetails
      };
    });

    // Sort by total score descending
    scores.sort((a, b) => b.score.total - a.score.total);

    return NextResponse.json({ scores });
  } catch (error) {
    console.error('Failed to compute scores:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

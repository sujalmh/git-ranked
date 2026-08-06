import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  const { owner, name } = await params;
  const url = new URL(req.url);
  const contributorParam = url.searchParams.get('contributor');

  try {
    // Public analytics endpoint: only serve public (non-installation) repos or
    // repos explicitly shared by their owner. Installation-tracked repos may be
    // private and must not be exposed here.
    const repoQuery = await sql`
      SELECT id FROM repositories
      WHERE owner = ${owner} AND name = ${name}
        AND (installation_id IS NULL OR share_enabled = true)
        AND is_active = true
    `;
    if (repoQuery.length === 0) {
      return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
    }
    const repoId = repoQuery[0].id;

    let workUnits;
    if (contributorParam) {
      const contributorId = parseInt(contributorParam, 10);
      workUnits = await sql`
        SELECT wu.id, wu.work_type, wu.summary, wu.facts, wu.derived, wu.extraction_confidence,
               wu.extraction_source, wu.shipped, wu.outcome, wu.size_metrics, wu.rationale,
               wu.shipped_at, wu.created_at
        FROM work_units wu
        JOIN work_unit_contributors wuc ON wu.id = wuc.work_unit_id
        WHERE wu.repo_id = ${repoId} AND wuc.contributor_id = ${contributorId}
        ORDER BY wu.created_at DESC
      `;
    } else {
      workUnits = await sql`
        SELECT wu.id, wu.work_type, wu.summary, wu.facts, wu.derived, wu.extraction_confidence,
               wu.extraction_source, wu.shipped, wu.outcome, wu.size_metrics, wu.rationale,
               wu.shipped_at, wu.created_at, wuc.contributor_id
        FROM work_units wu
        JOIN work_unit_contributors wuc ON wu.id = wuc.work_unit_id
        WHERE wu.repo_id = ${repoId}
        ORDER BY wu.created_at DESC
        LIMIT 100
      `;
    }

    return NextResponse.json({ workUnits });
  } catch (error) {
    console.error('Failed to fetch work units:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function GET(
  req: Request,
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

  const repoId = repoQuery[0].id as number;

  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');

  let rows;
  if (jobId) {
    rows = await sql`
      SELECT job_id, repo_id, done, total, status, error, result_units, updated_at
      FROM job_progress
      WHERE job_id = ${jobId} AND repo_id = ${repoId}
    `;
  } else {
    rows = await sql`
      SELECT job_id, repo_id, done, total, status, error, result_units, updated_at
      FROM job_progress
      WHERE repo_id = ${repoId}
      ORDER BY updated_at DESC
      LIMIT 1
    `;
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No job progress found' }, { status: 404 });
  }

  const row = rows[0];
  const done = Number(row.done || 0);
  const total = Number(row.total || 0);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return NextResponse.json({
    jobId: row.job_id,
    repoId: row.repo_id,
    status: row.status,
    done,
    total,
    percent,
    resultUnits: row.result_units ?? null,
    error: row.error ?? null,
    updatedAt: row.updated_at,
  });
}

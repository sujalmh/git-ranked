import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getUserRepoId } from '@/lib/repo-access';

export async function GET(
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

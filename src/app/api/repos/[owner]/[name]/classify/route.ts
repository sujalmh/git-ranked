import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getUserAiConfig } from '@/lib/ai/openrouter';
import { enqueueClassifyRepo } from '@/lib/queue';

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

  const repoId = repoQuery[0].id as number;
  const userId = Number(session.user.id);
  const userAiConfig = await getUserAiConfig(userId);

  try {
    const jobId = await enqueueClassifyRepo(repoId, userAiConfig);
    return NextResponse.json({ jobId, repoId });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to enqueue classify job:', errorMessage);
    return NextResponse.json({ error: 'Failed to enqueue classification job' }, { status: 500 });
  }
}

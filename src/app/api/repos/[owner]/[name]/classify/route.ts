import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { enqueueClassifyRepo } from '@/lib/queue';
import { getUserRepoId } from '@/lib/repo-access';

export async function POST(
  _req: Request,
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

  const userId = Number(session.user.id);

  try {
    const jobId = await enqueueClassifyRepo(repoId, userId);
    return NextResponse.json({ jobId, repoId });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to enqueue classify job:', errorMessage);
    return NextResponse.json({ error: 'Failed to enqueue classification job' }, { status: 500 });
  }
}

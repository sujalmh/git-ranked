import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { setRepoPublic, revokeRepoPublic } from '@/lib/share';
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

  await setRepoPublic(repoId);
  return NextResponse.json({ enabled: true });
}

export async function DELETE(
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

  await revokeRepoPublic(repoId);
  return NextResponse.json({ enabled: false });
}

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ensureShareToken, revokeShareToken } from '@/lib/share';
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

  const token = await ensureShareToken(repoId);
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/shared/${token}`;
  return NextResponse.json({ token, url: shareUrl, enabled: true });
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

  await revokeShareToken(repoId);
  return NextResponse.json({ enabled: false });
}

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { ensureShareToken, revokeShareToken } from '@/lib/share';

type RepoLookup = { id: number }[];

async function getOwnedRepoId(owner: string, name: string, userId: string): Promise<number | null> {
  const rows = (await sql`
    SELECT r.id
    FROM repositories r
    LEFT JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name} 
      AND (i.linked_user_id = ${userId} OR r.installation_id IS NULL)
  `) as RepoLookup;
  return rows.length > 0 ? rows[0].id : null;
}

export async function POST(
  _req: Request,
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { owner, name } = await props.params;
  const repoId = await getOwnedRepoId(owner, name, session.user.id);
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
  const repoId = await getOwnedRepoId(owner, name, session.user.id);
  if (repoId === null) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
  }

  await revokeShareToken(repoId);
  return NextResponse.json({ enabled: false });
}

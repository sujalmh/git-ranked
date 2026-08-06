import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { isRepoOwnedByUser } from '@/lib/repo-access';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { repoId } = await req.json();
    if (!repoId) {
      return NextResponse.json({ error: 'Repository ID is required' }, { status: 400 });
    }

    const parsedRepoId = Number(repoId);
    if (!Number.isInteger(parsedRepoId) || parsedRepoId <= 0) {
      return NextResponse.json({ error: 'Invalid repository ID' }, { status: 400 });
    }

    // Ownership check: only the user who added a public repo or whose GitHub
    // App installation tracks the repo may remove it.
    const owned = await isRepoOwnedByUser(parsedRepoId, session.user.id);
    if (!owned) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    // Soft removal: toggle is_active = false to hide from dashboard while preserving historical database data
    await sql`
      UPDATE repositories
      SET is_active = false
      WHERE id = ${parsedRepoId}
    `;

    return NextResponse.json({ success: true, repoId });
  } catch (error) {
    console.error('Failed to remove repo from dashboard:', error);
    return NextResponse.json({ error: 'Failed to remove repository' }, { status: 500 });
  }
}

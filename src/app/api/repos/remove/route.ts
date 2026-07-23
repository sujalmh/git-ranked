import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

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

    // Soft removal: toggle is_active = false to hide from dashboard while preserving historical database data
    await sql`
      UPDATE repositories
      SET is_active = false
      WHERE id = ${Number(repoId)}
    `;

    return NextResponse.json({ success: true, repoId });
  } catch (error) {
    console.error('Failed to remove repo from dashboard:', error);
    return NextResponse.json({ error: 'Failed to remove repository' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const repos = await sql`
      SELECT r.id, r.owner, r.name, r.default_branch, r.github_repo_id 
      FROM repositories r
      LEFT JOIN installations i ON r.installation_id = i.id
      WHERE (i.linked_user_id = ${session.user.id} OR r.installation_id IS NULL) AND r.is_active = true
      ORDER BY r.added_at DESC
    `;
    return NextResponse.json({ repos });
  } catch (error) {
    console.error('Failed to fetch repos:', error);
    return NextResponse.json({ error: 'Failed to fetch repositories' }, { status: 500 });
  }
}

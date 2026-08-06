import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { scoreRepo } from '@/lib/scoring';
import type { ProfileName } from '@/lib/scoring';
import { isAdminGithubId } from '@/lib/admin';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await isAdminGithubId(session.user.githubId);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { repo_id, profile } = body as { repo_id: number; profile: ProfileName };

    if (!repo_id || !profile) {
      return NextResponse.json({ error: 'Missing repo_id or profile' }, { status: 400 });
    }

    const validProfiles: ProfileName[] = ['balanced', 'product', 'infrastructure', 'open_source', 'research'];
    if (!validProfiles.includes(profile)) {
      return NextResponse.json({ error: 'Invalid profile name' }, { status: 400 });
    }

    await sql`
      UPDATE repositories
      SET scoring_profile = ${profile}
      WHERE id = ${repo_id}
    `;

    // Rescore repo with the new active profile settings
    await scoreRepo(repo_id);

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error('Failed to update scoring profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

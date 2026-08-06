import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getPublicRepository } from '@/lib/github-api';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { owner, name } = await req.json();
    if (!owner || !name) {
      return NextResponse.json({ error: 'Owner and name are required' }, { status: 400 });
    }

    // Check if the repo already exists in DB
    const existingRepo = await sql`
      SELECT id, owner, name, is_active FROM repositories 
      WHERE owner ILIKE ${owner} AND name ILIKE ${name}
      LIMIT 1
    `;

    if (existingRepo.length > 0) {
      if (!existingRepo[0].is_active) {
        await sql`
          UPDATE repositories SET is_active = true WHERE id = ${existingRepo[0].id}
        `;
      }
      // If this public repo was added before ownership tracking existed,
      // adopt it so the current user manages it (legacy rows have NULL).
      await sql`
        UPDATE repositories
        SET added_by_user_id = COALESCE(added_by_user_id, ${session.user.id})
        WHERE id = ${existingRepo[0].id}
      `;
      return NextResponse.json({
        repoId: existingRepo[0].id,
        owner: existingRepo[0].owner,
        name: existingRepo[0].name,
        alreadyExists: true,
      });
    }

    // Use getPublicRepository which properly falls back to unauthenticated or GITHUB_TOKEN header
    // to fetch public repository data without triggering 403 Forbidden errors
    const githubRepoData = await getPublicRepository(owner, name);
    if (!githubRepoData) {
      return NextResponse.json({ error: 'Public repository not found on GitHub or is private' }, { status: 404 });
    }

    const { id: github_repo_id, owner: { login: fetchedOwner }, name: fetchedName } = githubRepoData;

    // Default branch fallback if not provided
    const defaultBranch = githubRepoData.default_branch || 'main';

    // Insert into repositories with installation_id = NULL, scoped to the user
    const newRepo = await sql`
      INSERT INTO repositories (github_repo_id, owner, name, default_branch, is_active, added_by_user_id)
      VALUES (${github_repo_id}, ${fetchedOwner}, ${fetchedName}, ${defaultBranch}, true, ${session.user.id})
      RETURNING id, owner, name
    `;

    return NextResponse.json({
      repoId: newRepo[0].id,
      owner: newRepo[0].owner,
      name: newRepo[0].name,
      alreadyExists: false,
    });

  } catch (error) {
    console.error('Failed to add public repo:', error);
    return NextResponse.json({ error: 'Failed to add repository' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { githubInstallationApi } from '@/lib/github-api';

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

    // Check if the repo already exists
    const existingRepo = await sql`
      SELECT id, owner, name FROM repositories 
      WHERE owner ILIKE ${owner} AND name ILIKE ${name}
      LIMIT 1
    `;

    if (existingRepo.length > 0) {
      return NextResponse.json({
        repoId: existingRepo[0].id,
        owner: existingRepo[0].owner,
        name: existingRepo[0].name,
        alreadyExists: true,
      });
    }

    // If not, fetch repo details from GitHub
    // We pass the user's access token if available to prevent rate limits
    const tokenToUse = (session as any).accessToken || null;
    let githubRepoData;
    try {
      githubRepoData = await githubInstallationApi<any>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
        tokenToUse
      );
    } catch (err: any) {
      if (err.message?.includes('404')) {
        return NextResponse.json({ error: 'Repository not found on GitHub' }, { status: 404 });
      }
      throw err;
    }

    const { id: github_repo_id, default_branch, owner: { login: fetchedOwner }, name: fetchedName } = githubRepoData;

    // Insert into repositories with installation_id = NULL
    const newRepo = await sql`
      INSERT INTO repositories (github_repo_id, owner, name, default_branch, is_active)
      VALUES (${github_repo_id}, ${fetchedOwner}, ${fetchedName}, ${default_branch}, true)
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

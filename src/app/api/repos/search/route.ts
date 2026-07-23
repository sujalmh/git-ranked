import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ items: [] });
  }

  const session = await auth();
  const token = (session as any)?.accessToken || process.env.GITHUB_TOKEN;

  const headers: Record<string, string> = {
    'User-Agent': 'GitRanked-App',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    // 1. Fetch search results from GitHub Public Repository Search API
    const ghRes = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}+is:public&sort=stars&order=desc&per_page=8`,
      { headers, next: { revalidate: 300 } }
    );

    let items: any[] = [];
    if (ghRes.ok) {
      const data = await ghRes.json();
      items = data.items || [];
    } else {
      console.warn(`GitHub search API returned HTTP ${ghRes.status}`);
      // Fallback search in local database if rate limited or GitHub API error
      const dbRepos = await sql`
        SELECT owner, name, default_branch
        FROM repositories
        WHERE (owner ILIKE ${'%' + q + '%'} OR name ILIKE ${'%' + q + '%'})
          AND is_active = true
        LIMIT 8
      `;

      items = dbRepos.map((r: any) => ({
        id: `${r.owner}/${r.name}`,
        name: r.name,
        full_name: `${r.owner}/${r.name}`,
        owner: { login: r.owner, avatar_url: `https://github.com/${r.owner}.png` },
        description: 'Tracked repository on GitRanked',
        stargazers_count: 0,
        language: 'Code',
      }));
    }

    // 2. Cross-reference with tracked repositories in local DB
    if (items.length > 0) {
      let dbTracked: Array<{ owner: string; name: string }> = [];
      try {
        dbTracked = (await sql`
          SELECT owner, name FROM repositories WHERE is_active = true
        `) as Array<{ owner: string; name: string }>;
      } catch (err) {
        console.error('Failed to query local tracked repos:', err);
      }

      const trackedSet = new Set(
        dbTracked.map((r) => `${r.owner.toLowerCase()}/${r.name.toLowerCase()}`)
      );

      const formattedItems = items.map((item: any) => ({
        id: item.id,
        name: item.name,
        full_name: item.full_name,
        owner: {
          login: item.owner?.login || '',
          avatar_url: item.owner?.avatar_url || `https://github.com/${item.owner?.login}.png`,
        },
        description: item.description || '',
        stargazers_count: item.stargazers_count || 0,
        forks_count: item.forks_count || 0,
        language: item.language || '',
        isTracked: trackedSet.has((item.full_name || '').toLowerCase()),
      }));

      return NextResponse.json({ items: formattedItems });
    }

    return NextResponse.json({ items: [] });
  } catch (error) {
    console.error('Failed to search public repositories:', error);
    return NextResponse.json({ error: 'Failed to search repositories' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

type GitHubRepoItem = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; avatar_url?: string };
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
};

type LocalDbRepo = {
  owner: string;
  name: string;
  default_branch?: string;
};

type SearchResultItem = GitHubRepoItem & { isTracked: boolean };

function toGitHubRepoItem(r: LocalDbRepo): GitHubRepoItem {
  return {
    id: 0,
    name: r.name,
    full_name: `${r.owner}/${r.name}`,
    owner: { login: r.owner, avatar_url: `https://github.com/${r.owner}.png` },
    description: 'Tracked repository on GitRanked',
    stargazers_count: 0,
    forks_count: 0,
    language: 'Code',
  };
}

function formatRepoItem(item: GitHubRepoItem, trackedSet: Set<string>): SearchResultItem {
  return {
    ...item,
    description: item.description || '',
    stargazers_count: item.stargazers_count || 0,
    forks_count: item.forks_count || 0,
    language: item.language || '',
    owner: {
      login: item.owner?.login || '',
      avatar_url: item.owner?.avatar_url || `https://github.com/${item.owner?.login}.png`,
    },
    isTracked: trackedSet.has((item.full_name || '').toLowerCase()),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ items: [] });
  }

  const session = await auth();
  const token = session?.accessToken || process.env.GITHUB_TOKEN;

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

    let items: GitHubRepoItem[] = [];
    if (ghRes.ok) {
      const data = (await ghRes.json()) as { items?: GitHubRepoItem[] };
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

      items = (dbRepos as LocalDbRepo[]).map(toGitHubRepoItem);
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

      const formattedItems = items.map((item) => formatRepoItem(item, trackedSet));

      return NextResponse.json({ items: formattedItems });
    }

    return NextResponse.json({ items: [] });
  } catch (error) {
    console.error('Failed to search public repositories:', error);
    return NextResponse.json({ error: 'Failed to search repositories' }, { status: 500 });
  }
}

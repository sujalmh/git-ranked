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
    // 1. Local matches first — cheap, always available, and surfaces repos
    // GitHub's relevance ranking might miss (including already-tracked ones).
    // Bounded query: only repos matching the query, never the whole table.
    let dbRepos: LocalDbRepo[] = [];
    try {
      const like = `%${q}%`;
      const parts = q.split('/').map((s) => s.trim()).filter(Boolean);
      if (parts.length === 2) {
        dbRepos = (await sql`
          SELECT owner, name, default_branch
          FROM repositories
          WHERE is_active = true
            AND ((owner ILIKE ${parts[0]} AND name ILIKE ${parts[1]})
              OR (owner ILIKE ${like} OR name ILIKE ${like}))
          LIMIT 8
        `) as LocalDbRepo[];
      } else {
        dbRepos = (await sql`
          SELECT owner, name, default_branch
          FROM repositories
          WHERE is_active = true
            AND (owner ILIKE ${like} OR name ILIKE ${like})
          LIMIT 8
        `) as LocalDbRepo[];
      }
    } catch (err) {
      console.error('Failed to query local repos for search:', err);
    }

    const trackedSet = new Set(
      dbRepos.map((r) => `${r.owner.toLowerCase()}/${r.name.toLowerCase()}`)
    );
    const dbItems = dbRepos.map(toGitHubRepoItem);

    // 2. GitHub search for broader public results. On failure (rate limit,
    // auth, network) degrade to local results instead of an empty list.
    let ghItems: GitHubRepoItem[] = [];
    try {
      const ghRes = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}+is:public&sort=stars&order=desc&per_page=8`,
        { headers, next: { revalidate: 300 } }
      );

      if (ghRes.ok) {
        const data = (await ghRes.json()) as { items?: GitHubRepoItem[] };
        ghItems = data.items || [];
      } else {
        console.warn(`GitHub search API returned HTTP ${ghRes.status}`);
      }
    } catch (err) {
      console.warn('GitHub search API failed, serving local results:', err);
    }

    // 3. Merge: exact/DB matches first (already flagged tracked), then GitHub
    // results not already present. Keeps tracked repos discoverable even when
    // GitHub omits them, and avoids duplicates by full_name.
    const seen = new Set<string>();
    const merged: GitHubRepoItem[] = [];
    for (const item of [...dbItems, ...ghItems]) {
      const key = (item.full_name || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= 12) break;
    }

    const formattedItems = merged.map((item) => formatRepoItem(item, trackedSet));

    return NextResponse.json({ items: formattedItems });
  } catch (error) {
    console.error('Failed to search public repositories:', error);
    return NextResponse.json({ error: 'Failed to search repositories' }, { status: 500 });
  }
}

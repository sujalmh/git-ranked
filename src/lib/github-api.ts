import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import githubAppJwt from 'universal-github-app-jwt';
import { isBotUsername } from './contributor-insights';

const DEFAULT_TIMEOUT_MS = 10_000;

export type GitHubUser = {
  id: number;
  login: string;
  avatar_url?: string | null;
  type?: string;
};

export type GitHubCommit = {
  sha: string;
  html_url?: string;
  commit: {
    message: string;
  };
  author?: GitHubUser | null;
};

export type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  body?: string | null;
  user?: GitHubUser | null;
  merged_at?: string | null;
  additions?: number;
  deletions?: number;
  changed_files?: number;
};

export type GitHubReview = {
  id: number;
  state: string;
  body?: string | null;
  user?: GitHubUser | null;
  submitted_at?: string | null;
};

export type GitHubPullRequestFile = {
  sha: string;
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  previous_filename?: string | null;
};

export type InstallationRepo = {
  id: number;
  github_installation_id: number | string;
  owner: string;
  name: string;
};

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, '\n').trim();
}

export function getGitHubAppPrivateKey() {
  const envPrivateKey = process.env.GITHUB_PRIVATE_KEY || process.env.GITHUB_APP_PRIVATE_KEY;
  if (envPrivateKey) return normalizePrivateKey(envPrivateKey);

  const envPrivateKeyPath = process.env.GITHUB_PRIVATE_KEY_PATH;
  if (envPrivateKeyPath && existsSync(envPrivateKeyPath)) {
    return readFileSync(envPrivateKeyPath, 'utf8').trim();
  }

  const localKeyPath = join(process.cwd(), 'git-ranked-dev.2026-07-18.private-key.pem');
  if (existsSync(localKeyPath)) {
    return readFileSync(localKeyPath, 'utf8').trim();
  }

  return null;
}

export function getGitHubAppConfig() {
  const appId = process.env.GITHUB_APP_ID?.replaceAll('"', '').trim();
  const privateKey = getGitHubAppPrivateKey();
  if (!appId || !privateKey) return null;

  return { appId, privateKey };
}

export async function getInstallationAccessToken(installationId: number | string) {
  const config = getGitHubAppConfig();
  if (!config) return null;

  const { token } = await githubAppJwt({
    id: config.appId,
    privateKey: config.privateKey,
  });

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to create installation token: ${response.status}`);
  }

  const data = (await response.json()) as { token: string };
  return data.token;
}

export async function githubInstallationApi<T>(path: string, token: string | null, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`https://api.github.com${path}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers,
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed for ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function upsertContributor(user: GitHubUser | null | undefined): Promise<number | null> {
  if (!user) return null;
  if (user.type === 'Bot' || isBotUsername(user.login)) return null;

  const { sql } = await import('./db');
  const rows = await sql`
    INSERT INTO github_contributors (github_id, username, avatar_url, last_seen_at)
    VALUES (${user.id}, ${user.login}, ${user.avatar_url ?? null}, NOW())
    ON CONFLICT (github_id) DO UPDATE
    SET username = ${user.login}, avatar_url = ${user.avatar_url ?? null}, last_seen_at = NOW()
    RETURNING id
  `;

  return rows[0].id as number;
}

export type PublicGitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  created_at: string;
  updated_at: string;
  open_issues_count: number;
  private: boolean;
};

export async function getPublicRepository(owner: string, name: string): Promise<PublicGitHubRepo | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      headers,
      next: { revalidate: 3600 } // Cache public API results for 1 hour
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch public repo: ${response.status}`);
    }

    const data = await response.json();
    if (data.private) return null; // Ensure we don't accidentally leak private repos if token has access

    return data as PublicGitHubRepo;
  } catch (error) {
    console.error(`Failed to fetch public repository ${owner}/${name}:`, error);
    return null;
  }
}

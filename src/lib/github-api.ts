import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { cache } from 'react';
import githubAppJwt from 'universal-github-app-jwt';
import { isBotUsername } from './contributor-insights';
import { emitTelemetry } from './ai/openrouter';

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
    author?: { date?: string } | null;
    committer?: { date?: string } | null;
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
  created_at?: string | null;
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

// Installation access tokens are valid for 1 hour. Cache them (per instance)
// so backfills that make many requests don't mint a fresh JWT + token per call.
const INSTALLATION_TOKEN_TTL_MS = 50 * 60 * 1000;
const installationTokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getInstallationAccessToken(installationId: number | string) {
  const cacheKey = String(installationId);
  const cached = installationTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

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
  installationTokenCache.set(cacheKey, { token: data.token, expiresAt: Date.now() + INSTALLATION_TOKEN_TTL_MS });
  return data.token;
}

const etagCache = new Map<string, { etag: string; data: unknown }>();

export async function githubInstallationApi<T>(
  path: string,
  token: string | null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  useEtag = false
): Promise<T> {
  const startTime = Date.now();
  const cleanPath = path.split('?')[0];
  emitTelemetry({
    type: 'api_request',
    provider: 'github',
    endpoint: `GET ${cleanPath}`,
    summary: `[API_REQ] GET api.github.com${cleanPath}`,
  });

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const cached = useEtag ? etagCache.get(path) : undefined;
  if (cached?.etag) {
    headers['If-None-Match'] = cached.etag;
  }

  let response: Response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers,
    });
  } catch (netErr) {
    const latencyMs = Date.now() - startTime;
    const errStr = netErr instanceof Error ? netErr.message : String(netErr);
    emitTelemetry({
      type: 'api_error',
      provider: 'github',
      endpoint: `GET ${cleanPath}`,
      latencyMs,
      summary: `[API_ERR] GitHub API request failed (${latencyMs}ms): ${errStr}`,
    });
    throw netErr;
  }

  const latencyMs = Date.now() - startTime;

  if (response.status === 304 && cached) {
    emitTelemetry({
      type: 'api_response',
      provider: 'github',
      endpoint: `GET ${cleanPath}`,
      status: 304,
      latencyMs,
      summary: `[API_RES] GitHub API 304 Not Modified (${latencyMs}ms)`,
    });
    return cached.data as T;
  }

  if (!response.ok) {
    emitTelemetry({
      type: 'api_error',
      provider: 'github',
      endpoint: `GET ${cleanPath}`,
      status: response.status,
      latencyMs,
      summary: `[API_ERR] GitHub API HTTP ${response.status} (${latencyMs}ms)`,
    });
    throw new Error(`GitHub API request failed for ${path}: ${response.status}`);
  }

  emitTelemetry({
    type: 'api_response',
    provider: 'github',
    endpoint: `GET ${cleanPath}`,
    status: 200,
    latencyMs,
    summary: `[API_RES] GitHub API 200 OK (${latencyMs}ms)`,
  });

  const data = (await response.json()) as T;

  if (useEtag) {
    const etag = response.headers.get('etag');
    if (etag) {
      etagCache.set(path, { etag, data });
    }
  }

  return data;
}

export async function githubGraphQLApi<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string | null,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const startTime = Date.now();
  emitTelemetry({
    type: 'api_request',
    provider: 'github',
    endpoint: 'POST /graphql',
    summary: '[API_REQ] POST api.github.com/graphql',
  });

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers,
      body: JSON.stringify({ query, variables }),
    });
  } catch (netErr) {
    const latencyMs = Date.now() - startTime;
    const errStr = netErr instanceof Error ? netErr.message : String(netErr);
    emitTelemetry({
      type: 'api_error',
      provider: 'github',
      endpoint: 'POST /graphql',
      latencyMs,
      summary: `[API_ERR] GitHub GraphQL request failed (${latencyMs}ms): ${errStr}`,
    });
    throw netErr;
  }

  const latencyMs = Date.now() - startTime;

  if (!response.ok) {
    emitTelemetry({
      type: 'api_error',
      provider: 'github',
      endpoint: 'POST /graphql',
      status: response.status,
      latencyMs,
      summary: `[API_ERR] GitHub GraphQL HTTP ${response.status} (${latencyMs}ms)`,
    });
    throw new Error(`GitHub GraphQL request failed: ${response.status}`);
  }

  const result = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

  if (result.errors && result.errors.length > 0) {
    const msg = result.errors.map((e) => e.message).join('; ');
    throw new Error(`GitHub GraphQL query returned errors: ${msg}`);
  }

  if (!result.data) {
    throw new Error('GitHub GraphQL query returned no data');
  }

  emitTelemetry({
    type: 'api_response',
    provider: 'github',
    endpoint: 'POST /graphql',
    status: 200,
    latencyMs,
    summary: `[API_RES] GitHub GraphQL 200 OK (${latencyMs}ms)`,
  });

  return result.data;
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
  default_branch: string;
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

// Dedupe within a single render so generateMetadata (layout) and the page body
// share one GitHub API call per request instead of two.
export const getPublicRepositoryCached = cache(getPublicRepository);

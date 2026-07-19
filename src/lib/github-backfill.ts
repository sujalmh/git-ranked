import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import githubAppJwt from 'universal-github-app-jwt';
import { sql } from './db';

type GitHubUser = {
  id: number;
  login: string;
  avatar_url?: string | null;
};

type GitHubCommit = {
  sha: string;
  html_url?: string;
  commit: {
    message: string;
  };
  author?: GitHubUser | null;
};

type GitHubPullRequest = {
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

type GitHubReview = {
  id: number;
  state: string;
  body?: string | null;
  user?: GitHubUser | null;
  submitted_at?: string | null;
};

type BackfillRepo = {
  id: number;
  github_installation_id: number | string;
  owner: string;
  name: string;
};

type InstallationTokenResponse = {
  token: string;
};

const BACKFILL_REQUEST_TIMEOUT_MS = 10_000;
const BACKFILL_COMMIT_LIMIT = 50;
const BACKFILL_PULL_REQUEST_LIMIT = 10;
const BACKFILL_REVIEW_LIMIT = 20;

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, '\n').trim();
}

function getGitHubAppPrivateKey() {
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

function getGitHubAppConfig() {
  const appId = process.env.GITHUB_APP_ID?.replaceAll('"', '').trim();
  const privateKey = getGitHubAppPrivateKey();
  if (!appId || !privateKey) return null;

  return {
    appId,
    privateKey,
  };
}

async function upsertContributor(user: GitHubUser | null | undefined) {
  if (!user) return null;

  const rows = await sql`
    INSERT INTO github_contributors (github_id, username, avatar_url, last_seen_at)
    VALUES (${user.id}, ${user.login}, ${user.avatar_url ?? null}, NOW())
    ON CONFLICT (github_id) DO UPDATE
    SET username = ${user.login}, avatar_url = ${user.avatar_url ?? null}, last_seen_at = NOW()
    RETURNING id
  `;

  return rows[0].id as number;
}

async function insertBackfilledEvent(params: {
  repoId: number;
  contributorId: number | null;
  eventType: string;
  payload: Record<string, unknown>;
  githubEventId: string;
}) {
  if (!params.contributorId) return;

  await sql`
    INSERT INTO github_events (repo_id, contributor_id, event_type, payload, github_event_id)
    VALUES (${params.repoId}, ${params.contributorId}, ${params.eventType}, ${JSON.stringify(params.payload)}, ${params.githubEventId})
    ON CONFLICT (github_event_id) DO NOTHING
  `;
}

async function getInstallationAccessToken(installationId: number | string) {
  const config = getGitHubAppConfig();
  if (!config) return null;

  const { token } = await githubAppJwt({
    id: config.appId,
    privateKey: config.privateKey,
  });

  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    signal: AbortSignal.timeout(BACKFILL_REQUEST_TIMEOUT_MS),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to create installation token: ${response.status}`);
  }

  const data = (await response.json()) as InstallationTokenResponse;
  return data.token;
}

async function githubInstallationApi<T>(path: string, token: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    signal: AbortSignal.timeout(BACKFILL_REQUEST_TIMEOUT_MS),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub backfill request failed for ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
}

function reviewWordCount(body: string | null | undefined) {
  if (!body) return 0;
  return body.trim().split(/\s+/).filter(Boolean).length;
}

export async function backfillRepoActivity(repo: BackfillRepo) {
  const installationToken = await getInstallationAccessToken(repo.github_installation_id);
  if (!installationToken) {
    console.warn('Skipping GitHub backfill: GITHUB_APP_ID and private key are not configured');
    return { skipped: true, inserted: 0 };
  }

  let inserted = 0;
  const owner = encodeURIComponent(repo.owner);
  const repoName = encodeURIComponent(repo.name);

  const commits = await githubInstallationApi<GitHubCommit[]>(
    `/repos/${owner}/${repoName}/commits?per_page=${BACKFILL_COMMIT_LIMIT}`,
    installationToken
  );

  for (const commit of commits) {
    const contributorId = await upsertContributor(commit.author);
    await insertBackfilledEvent({
      repoId: repo.id,
      contributorId,
      eventType: 'push',
      githubEventId: `backfill:commit:${commit.sha}`,
      payload: {
        commits: [{ sha: commit.sha, message: commit.commit.message, url: commit.html_url }],
        commit_count: 1,
      },
    });
    inserted += contributorId ? 1 : 0;
  }

  const pulls = await githubInstallationApi<GitHubPullRequest[]>(
    `/repos/${owner}/${repoName}/pulls?state=all&sort=updated&direction=desc&per_page=${BACKFILL_PULL_REQUEST_LIMIT}`,
    installationToken
  );

  for (const pullListItem of pulls) {
    const pull = await githubInstallationApi<GitHubPullRequest>(
      `/repos/${owner}/${repoName}/pulls/${pullListItem.number}`,
      installationToken
    );
    const contributorId = await upsertContributor(pull.user);

    await insertBackfilledEvent({
      repoId: repo.id,
      contributorId,
      eventType: 'pr_opened',
      githubEventId: `backfill:pr_opened:${pull.id}`,
      payload: {
        pr_number: pull.number,
        title: pull.title,
        url: pull.html_url,
        body: pull.body,
      },
    });
    inserted += contributorId ? 1 : 0;

    if (pull.merged_at) {
      await insertBackfilledEvent({
        repoId: repo.id,
        contributorId,
        eventType: 'pr_merged',
        githubEventId: `backfill:pr_merged:${pull.id}`,
        payload: {
          pr_number: pull.number,
          title: pull.title,
          url: pull.html_url,
          additions: pull.additions ?? 0,
          deletions: pull.deletions ?? 0,
          changed_files: pull.changed_files ?? 0,
        },
      });
      inserted += contributorId ? 1 : 0;
    }

    const reviews = await githubInstallationApi<GitHubReview[]>(
      `/repos/${owner}/${repoName}/pulls/${pull.number}/reviews?per_page=${BACKFILL_REVIEW_LIMIT}`,
      installationToken
    );

    for (const review of reviews) {
      const reviewerId = await upsertContributor(review.user);
      await insertBackfilledEvent({
        repoId: repo.id,
        contributorId: reviewerId,
        eventType: 'review_submitted',
        githubEventId: `backfill:review:${review.id}`,
        payload: {
          pr_number: pull.number,
          state: review.state?.toLowerCase(),
          body: review.body,
          word_count: reviewWordCount(review.body),
        },
      });
      inserted += reviewerId ? 1 : 0;
    }
  }

  return { skipped: false, inserted };
}

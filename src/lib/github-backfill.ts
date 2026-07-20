import { sql } from './db';
import {
  getInstallationAccessToken,
  githubInstallationApi,
  upsertContributor,
  type GitHubCommit,
  type GitHubPullRequest,
  type GitHubReview,
  type GitHubUser,
  type InstallationRepo,
} from './github-api';

export type { GitHubUser, GitHubCommit, GitHubPullRequest, GitHubReview, InstallationRepo };

const BACKFILL_COMMIT_LIMIT = 50;
const BACKFILL_PULL_REQUEST_LIMIT = 10;
const BACKFILL_REVIEW_LIMIT = 20;

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

function reviewWordCount(body: string | null | undefined) {
  if (!body) return 0;
  return body.trim().split(/\s+/).filter(Boolean).length;
}

export async function backfillRepoActivity(repo: InstallationRepo, userToken?: string) {
  let tokenToUse: string | null = userToken || null;
  
  if (repo.github_installation_id) {
    const installationToken = await getInstallationAccessToken(repo.github_installation_id);
    if (installationToken) {
      tokenToUse = installationToken;
    }
  }

  if (!tokenToUse && repo.github_installation_id) {
    console.warn('Skipping GitHub backfill: GITHUB_APP_ID and private key are not configured');
    return { skipped: true, inserted: 0 };
  }

  let inserted = 0;
  const owner = encodeURIComponent(repo.owner);
  const repoName = encodeURIComponent(repo.name);

  const commits = await githubInstallationApi<GitHubCommit[]>(
    `/repos/${owner}/${repoName}/commits?per_page=${BACKFILL_COMMIT_LIMIT}`,
    tokenToUse
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
    tokenToUse
  );

  for (const pullListItem of pulls) {
    const pull = await githubInstallationApi<GitHubPullRequest>(
      `/repos/${owner}/${repoName}/pulls/${pullListItem.number}`,
      tokenToUse
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
      tokenToUse
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

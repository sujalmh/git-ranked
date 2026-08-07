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

const PER_PAGE = 100;
// Backfill is bounded by a recent TIME WINDOW, not by page count. This tool
// scores/ranks recent impact (health = 30 days, AI = 30-day windows), so
// pulling years of commit history is unnecessary and harmful: it blows GitHub
// rate limits, bloats the DB, and slows every leaderboard/score query. Going
// forward webhooks capture all activity; backfill only needs to catch up a
// recent window. The window is configurable via env with a hard cap so no one
// accidentally pulls an entire repo's history.
const DEFAULT_HISTORY_DAYS = 90;
const MAX_HISTORY_DAYS = 365;
const MAX_PAGES = 50;          // safety ceiling even for very active repos
const DETAIL_REVIEW_PR_LIMIT = 25;  // only newest PRs get detail + reviews fetches
const BACKFILL_REVIEW_LIMIT = 20;

function historyDays(): number {
  const raw = Number(process.env.BACKFILL_HISTORY_DAYS ?? DEFAULT_HISTORY_DAYS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_HISTORY_DAYS;
  return Math.min(MAX_HISTORY_DAYS, Math.floor(raw));
}

function backfillSince(): string {
  const days = historyDays();
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function isAtOrAfter(dateStr: string | null | undefined, since: string): boolean {
  if (!dateStr) return true; // unknown date → keep, don't drop
  return new Date(dateStr).getTime() >= new Date(since).getTime() - 86_400_000; // 1-day tolerance
}

async function insertBackfilledEvent(params: {
  repoId: number;
  contributorId: number | null;
  eventType: string;
  payload: Record<string, unknown>;
  githubEventId: string;
  createdAt?: string | null;
}) {
  if (!params.contributorId) return;

  // Use the real GitHub event timestamp when available so historical events
  // keep their original date; fall back to now only if a timestamp is missing.
  const createdAt = params.createdAt ?? new Date().toISOString();

  // ON CONFLICT DO UPDATE (not DO NOTHING) so re-running backfill repairs the
  // created_at of rows that were previously stamped with ingestion time.
  await sql`
    INSERT INTO github_events (repo_id, contributor_id, event_type, payload, github_event_id, created_at)
    VALUES (${params.repoId}, ${params.contributorId}, ${params.eventType}, ${JSON.stringify(params.payload)}, ${params.githubEventId}, ${createdAt})
    ON CONFLICT (github_event_id) DO UPDATE
    SET created_at = EXCLUDED.created_at
  `;
}

function reviewWordCount(body: string | null | undefined) {
  if (!body) return 0;
  return body.trim().split(/\s+/).filter(Boolean).length;
}

// Author payload stored on push events so the scoring pipeline can attribute a
// work unit across every distinct commit author (proportional credit), not just
// the webhook sender. `id`/`login` come from the commit API's author object;
// `name`/`email` come from the commit metadata.
function commitAuthorPayload(commit: GitHubCommit) {
  return {
    id: commit.author?.id ?? null,
    login: commit.author?.login ?? null,
    name: commit.commit.author?.name ?? null,
    email: commit.commit.author?.email ?? null,
  };
}

function commitEventPayload(commit: GitHubCommit): Record<string, unknown> {
  return {
    sha: commit.sha,
    message: commit.commit.message,
    url: commit.html_url,
    author: commitAuthorPayload(commit),
  };
}

// PR identity fields needed by the aggregator to absorb branch pushes into the
// merged-PR candidate (kills the same-work-scored-twice double count).
function prIdentityPayload(pr: GitHubPullRequest): Record<string, unknown> {
  return {
    pr_number: pr.number,
    title: pr.title,
    url: pr.html_url,
    base_ref: pr.base?.ref ?? null,
    head_ref: pr.head?.ref ?? null,
    head_sha: pr.head?.sha ?? null,
    merge_commit_sha: pr.merge_commit_sha ?? null,
    merged_at: pr.merged_at ?? null,
  };
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
  const since = backfillSince();
  console.log(`Backfill ${repo.owner}/${repo.name} (window: since ${since}, ${historyDays()}d)`);

  let fetchedCommitsInWindow = 0;

  // --- Commits: server-side filtered by `since`; stop at end of history ---
  for (let page = 1; page <= MAX_PAGES; page++) {
    let commits: GitHubCommit[];
    try {
      commits = await githubInstallationApi<GitHubCommit[]>(
        `/repos/${owner}/${repoName}/commits?per_page=${PER_PAGE}&page=${page}&since=${encodeURIComponent(since)}`,
        tokenToUse
      );
    } catch (err) {
      console.warn(`Backfill: commits page ${page} failed:`, err instanceof Error ? err.message : err);
      break;
    }
    if (commits.length === 0) break;
    fetchedCommitsInWindow += commits.length;

    for (const commit of commits) {
      const contributorId = await upsertContributor(commit.author);
      // committer.date = when the commit landed in the repo (most relevant for
      // activity timelines); fall back to author date, then to now.
      const commitDate =
        commit.commit.committer?.date ?? commit.commit.author?.date ?? null;
      await insertBackfilledEvent({
        repoId: repo.id,
        contributorId,
        eventType: 'push',
        githubEventId: `backfill:commit:${commit.sha}`,
        createdAt: commitDate,
        payload: {
          commits: [commitEventPayload(commit)],
          commit_count: 1,
        },
      });
      if (contributorId) inserted += 1;
    }

    if (commits.length < PER_PAGE) break;
  }

  // Fallback: If 0 commits were found within the recent window (e.g. repository activity occurred >90 days ago),
  // fetch the most recent commits page without the `since` filter so older repos populate history!
  let isFallback = false;
  if (fetchedCommitsInWindow === 0) {
    try {
      const fallbackCommits = await githubInstallationApi<GitHubCommit[]>(
        `/repos/${owner}/${repoName}/commits?per_page=${PER_PAGE}&page=1`,
        tokenToUse
      );
      if (fallbackCommits.length > 0) {
        console.log(`Backfill fallback: fetched ${fallbackCommits.length} recent commits for ${repo.owner}/${repo.name}`);
        isFallback = true;
        for (const commit of fallbackCommits) {
          const contributorId = await upsertContributor(commit.author);
          const commitDate = commit.commit.committer?.date ?? commit.commit.author?.date ?? null;
          await insertBackfilledEvent({
            repoId: repo.id,
            contributorId,
            eventType: 'push',
            githubEventId: `backfill:commit:${commit.sha}`,
            createdAt: commitDate,
            payload: {
              commits: [commitEventPayload(commit)],
              commit_count: 1,
            },
          });
          if (contributorId) inserted += 1;
        }
      }
    } catch (err) {
      console.warn(`Backfill fallback commits failed:`, err instanceof Error ? err.message : err);
    }
  }

  // --- Pull requests: sorted by created desc; stop when older than the window ---
  const pulls: GitHubPullRequest[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let pagePulls: GitHubPullRequest[];
    try {
      pagePulls = await githubInstallationApi<GitHubPullRequest[]>(
        `/repos/${owner}/${repoName}/pulls?state=all&sort=created&direction=desc&per_page=${PER_PAGE}&page=${page}`,
        tokenToUse
      );
    } catch (err) {
      console.warn(`Backfill: pulls page ${page} failed:`, err instanceof Error ? err.message : err);
      break;
    }
    if (pagePulls.length === 0) break;

    // PRs come back newest-first. Once the oldest PR on a page is before the
    // window we can stop paginating entirely.
    let reachedCutoff = false;
    for (const pr of pagePulls) {
      if (!isFallback && !isAtOrAfter(pr.created_at, since)) {
        reachedCutoff = true;
        break;
      }
      pulls.push(pr);
    }
    if (reachedCutoff || pagePulls.length < PER_PAGE || isFallback) break;
  }

  // pulls are most-recent-first; only the first DETAIL_REVIEW_PR_LIMIT get the
  // expensive per-PR detail + reviews fetches. Older PRs still record their
  // opened/merged events (and thus their contributors) without diff stats.
  for (let i = 0; i < pulls.length; i++) {
    const pullListItem = pulls[i];
    const contributorId = await upsertContributor(pullListItem.user);

    await insertBackfilledEvent({
      repoId: repo.id,
      contributorId,
      eventType: 'pr_opened',
      githubEventId: `backfill:pr_opened:${pullListItem.id}`,
      createdAt: pullListItem.created_at,
      payload: {
        ...prIdentityPayload(pullListItem),
        body: pullListItem.body,
      },
    });
    if (contributorId) inserted += 1;

    if (pullListItem.merged_at) {
      let mergePayload: Record<string, unknown> = prIdentityPayload(pullListItem);

      if (i < DETAIL_REVIEW_PR_LIMIT) {
        try {
          const pull = await githubInstallationApi<GitHubPullRequest>(
            `/repos/${owner}/${repoName}/pulls/${pullListItem.number}`,
            tokenToUse
          );
          mergePayload = {
            ...prIdentityPayload(pull),
            additions: pull.additions ?? 0,
            deletions: pull.deletions ?? 0,
            changed_files: pull.changed_files ?? 0,
          };
        } catch (err) {
          console.warn(`Backfill: PR detail #${pullListItem.number} failed:`, err instanceof Error ? err.message : err);
        }
      }

      await insertBackfilledEvent({
        repoId: repo.id,
        contributorId,
        eventType: 'pr_merged',
        githubEventId: `backfill:pr_merged:${pullListItem.id}`,
        createdAt: pullListItem.merged_at,
        payload: mergePayload,
      });
      if (contributorId) inserted += 1;
    }

    if (i < DETAIL_REVIEW_PR_LIMIT) {
      let reviews: GitHubReview[] = [];
      try {
        reviews = await githubInstallationApi<GitHubReview[]>(
          `/repos/${owner}/${repoName}/pulls/${pullListItem.number}/reviews?per_page=${BACKFILL_REVIEW_LIMIT}`,
          tokenToUse
        );
      } catch (err) {
        console.warn(`Backfill: reviews for PR #${pullListItem.number} failed:`, err instanceof Error ? err.message : err);
      }

      for (const review of reviews) {
        const reviewerId = await upsertContributor(review.user);
        await insertBackfilledEvent({
          repoId: repo.id,
          contributorId: reviewerId,
          eventType: 'review_submitted',
          githubEventId: `backfill:review:${review.id}`,
          createdAt: review.submitted_at,
          payload: {
            pr_number: pullListItem.number,
            state: review.state?.toLowerCase(),
            body: review.body,
            word_count: reviewWordCount(review.body),
          },
        });
        if (reviewerId) inserted += 1;
      }
    }
  }

  // Tag per-commit push events that are the head commit of a merged PR with the
  // PR number so the aggregator absorbs them into the PR candidate instead of
  // scoring the same work twice (a push unit + a PR unit). Matches on the stored
  // commit sha in the payload because backfilled events do not populate after_sha.
  for (const pullListItem of pulls) {
    if (!pullListItem.merged_at || !pullListItem.head?.sha) continue;
    try {
      await sql`
        UPDATE github_events
        SET payload = jsonb_set(payload, '{pr_number}', to_jsonb(${pullListItem.number}::int))
        WHERE repo_id = ${repo.id}
          AND event_type = 'push'
          AND payload->'commits' @> ${JSON.stringify([{ sha: pullListItem.head.sha }])}::jsonb
          AND (payload->>'pr_number') IS NULL
      `;
    } catch (err) {
      console.warn(`Backfill: tag head-commit push for PR #${pullListItem.number} failed:`, err instanceof Error ? err.message : err);
    }
  }

  // Streaming Candidate Ingestion: Trigger incremental candidate aggregation & background worker classification
  if (inserted > 0) {
    try {
      const { aggregateRepoCandidates } = await import('./scoring/aggregator');
      const { enqueueClassifyRepo } = await import('./queue');
      await aggregateRepoCandidates(repo.id);
      await enqueueClassifyRepo(repo.id).catch(() => {});
    } catch (err) {
      console.warn('Streaming candidate ingestion failed:', err);
    }
  }

  return { skipped: false, inserted };
}

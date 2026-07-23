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
          commits: [{ sha: commit.sha, message: commit.commit.message, url: commit.html_url }],
          commit_count: 1,
        },
      });
      if (contributorId) inserted += 1;
    }

    if (commits.length < PER_PAGE) break;
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
      if (!isAtOrAfter(pr.created_at, since)) {
        reachedCutoff = true;
        break;
      }
      pulls.push(pr);
    }
    if (reachedCutoff || pagePulls.length < PER_PAGE) break;
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
        pr_number: pullListItem.number,
        title: pullListItem.title,
        url: pullListItem.html_url,
        body: pullListItem.body,
      },
    });
    if (contributorId) inserted += 1;

    if (pullListItem.merged_at) {
      let mergePayload: Record<string, unknown> = {
        pr_number: pullListItem.number,
        title: pullListItem.title,
        url: pullListItem.html_url,
      };

      if (i < DETAIL_REVIEW_PR_LIMIT) {
        try {
          const pull = await githubInstallationApi<GitHubPullRequest>(
            `/repos/${owner}/${repoName}/pulls/${pullListItem.number}`,
            tokenToUse
          );
          mergePayload = {
            pr_number: pull.number,
            title: pull.title,
            url: pull.html_url,
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

import { sql } from './db';
import { isBotUsername } from './contributor-insights';

type GitHubAccountPayload = {
  id: number;
  login: string;
  type?: string | null;
};

type GitHubInstallationPayload = {
  id: number;
  account: GitHubAccountPayload;
  target_type?: string | null;
};

type GitHubRepositoryPayload = {
  id: number;
  full_name: string;
};

type GitHubSenderPayload = {
  id: number;
  login: string;
  avatar_url?: string | null;
  type?: string | null;
};

type GitHubCommitPayload = {
  id: string;
  message: string;
  url: string;
  timestamp?: string;
};

type GitHubPullRequestPayload = {
  number: number;
  title: string;
  html_url: string;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  body?: string | null;
  merged?: boolean;
  created_at?: string | null;
  merged_at?: string | null;
  closed_at?: string | null;
};

type GitHubReviewPayload = {
  state: string;
  body?: string | null;
  submitted_at?: string | null;
};

type GitHubIssuePayload = {
  number: number;
  title: string;
  body?: string | null;
  labels: { name: string }[];
  created_at?: string | null;
  closed_at?: string | null;
};

type GitHubReleasePayload = {
  tag_name: string;
  name?: string | null;
  body?: string | null;
  html_url: string;
  created_at?: string | null;
  published_at?: string | null;
};

type GitHubWebhookPayload = {
  action?: string;
  installation?: GitHubInstallationPayload;
  repositories_added?: GitHubRepositoryPayload[];
  repositories_removed?: Pick<GitHubRepositoryPayload, 'id'>[];
  repository?: GitHubRepositoryPayload;
  sender?: GitHubSenderPayload | null;
  commits?: GitHubCommitPayload[];
  head_commit?: GitHubCommitPayload | null;
  ref?: string;
  pull_request?: GitHubPullRequestPayload;
  review?: GitHubReviewPayload;
  issue?: GitHubIssuePayload;
  release?: GitHubReleasePayload;
};

async function upsertInstallationFromPayload(installation: GitHubInstallationPayload) {
  const account = installation.account;
  const existingUser = await sql`
    SELECT id FROM app_users WHERE github_id = ${account.id}
  `;
  const linkedUserId = existingUser.length > 0 ? existingUser[0].id : null;
  const status = linkedUserId ? 'active' : 'pending';
  const ownerType = installation.target_type || account.type || 'User';

  const dbInstall = await sql`
    INSERT INTO installations (
      github_installation_id, github_account_id, owner_login, owner_type,
      status, linked_user_id, updated_at
    )
    VALUES (
      ${installation.id}, ${account.id}, ${account.login}, ${ownerType},
      ${status}, ${linkedUserId}, NOW()
    )
    ON CONFLICT (github_installation_id) DO UPDATE
    SET status = CASE
          WHEN ${linkedUserId}::integer IS NOT NULL THEN 'active'
          ELSE installations.status
        END,
        linked_user_id = COALESCE(installations.linked_user_id, ${linkedUserId}),
        owner_login = ${account.login},
        owner_type = ${ownerType},
        github_account_id = ${account.id},
        updated_at = NOW()
    RETURNING id
  `;

  return dbInstall[0].id;
}

export async function handleWebhookEvent(eventName: string, payload: GitHubWebhookPayload, eventId: string) {
  // Deduplicate using github_event_id (not applicable to installation events, skip check for them)
  const isInstallEvent = eventName === 'installation' || eventName === 'installation_repositories';
  if (!isInstallEvent) {
    const existing = await sql`SELECT id FROM github_events WHERE github_event_id = ${eventId}`;
    if (existing.length > 0) {
      console.log(`Event ${eventId} already processed.`);
      return;
    }
  }

  // 1. Installation created — webhook is the source of truth
  // Store with status='pending'. If an app_user with this github_id already exists, link immediately.
  if (eventName === 'installation' && payload.action === 'created' && payload.installation) {
    await upsertInstallationFromPayload(payload.installation);
    return;
  }

  // 2. Installation deleted
  if (eventName === 'installation' && payload.action === 'deleted' && payload.installation) {
    const installId = payload.installation.id;
    await sql`
      UPDATE installations
      SET status = 'deleted', updated_at = NOW()
      WHERE github_installation_id = ${installId}
    `;
    return;
  }

  // 3. Installation Repositories added
  if (eventName === 'installation_repositories' && payload.action === 'added' && payload.installation) {
    const internalInstallId = await upsertInstallationFromPayload(payload.installation);

    for (const repo of payload.repositories_added ?? []) {
      const [owner, name] = repo.full_name.split('/');
      await sql`
        INSERT INTO repositories (installation_id, github_repo_id, owner, name)
        VALUES (${internalInstallId}, ${repo.id}, ${owner}, ${name})
        ON CONFLICT (github_repo_id) DO UPDATE
        SET installation_id = ${internalInstallId},
            owner = ${owner},
            name = ${name},
            is_active = true
      `;
    }
    return;
  }

  // 4. Installation Repositories removed
  if (eventName === 'installation_repositories' && payload.action === 'removed') {
    for (const repo of payload.repositories_removed ?? []) {
      await sql`
        UPDATE repositories SET is_active = false WHERE github_repo_id = ${repo.id}
      `;
    }
    return;
  }

  // Handle repository-specific events
  if (!payload.repository) return;
  const repoId = payload.repository.id;

  // Upsert the repository if it doesn't exist
  const dbRepo = await sql`SELECT id FROM repositories WHERE github_repo_id = ${repoId}`;
  let internalRepoId;
  if (dbRepo.length === 0) {
    let internalInstallId = null;
    if (payload.installation) {
      const dbInst = await sql`SELECT id FROM installations WHERE github_installation_id = ${payload.installation.id}`;
      if (dbInst.length > 0) internalInstallId = dbInst[0].id;
    }
    const [owner, name] = payload.repository.full_name.split('/');
    const newRepo = await sql`
      INSERT INTO repositories (installation_id, github_repo_id, owner, name)
      VALUES (${internalInstallId}, ${repoId}, ${owner}, ${name})
      ON CONFLICT (github_repo_id) DO UPDATE SET is_active = true
      RETURNING id
    `;
    internalRepoId = newRepo[0].id;
  } else {
    internalRepoId = dbRepo[0].id;
  }

  // Helper to upsert contributor
  async function upsertContributor(sender: GitHubSenderPayload | null | undefined): Promise<number | null> {
    if (!sender) return null;
    if (sender.type === 'Bot' || isBotUsername(sender.login)) return null;

    const res = await sql`
      INSERT INTO github_contributors (github_id, username, avatar_url, last_seen_at)
      VALUES (${sender.id}, ${sender.login}, ${sender.avatar_url}, NOW())
      ON CONFLICT (github_id) DO UPDATE
      SET username = ${sender.login}, avatar_url = ${sender.avatar_url}, last_seen_at = NOW()
      RETURNING id
    `;
    return res[0].id;
  }

  const sender = payload.sender;
  const contributorId = await upsertContributor(sender);
  if (!contributorId) return;

  let mappedEventType: string | null = null;
  let extractPayload: Record<string, unknown> = {};
  let eventCreatedAt: string | null = null;

  if (eventName === 'push') {
    mappedEventType = 'push';
    // Prefer the head commit's timestamp (the push moment); fall back to the
    // last commit on the push.
    eventCreatedAt = payload.head_commit?.timestamp
      ?? payload.commits?.[payload.commits.length - 1]?.timestamp
      ?? null;
    extractPayload = {
      commits: (payload.commits ?? []).map(commit => ({
        sha: commit.id,
        message: commit.message,
        url: commit.url,
      })),
      branch: payload.ref,
      commit_count: payload.commits?.length ?? 0,
    };
  } else if (eventName === 'pull_request' && payload.pull_request) {
    if (payload.action === 'opened') {
      mappedEventType = 'pr_opened';
      eventCreatedAt = payload.pull_request.created_at ?? null;
    } else if (payload.action === 'closed' && payload.pull_request.merged) {
      mappedEventType = 'pr_merged';
      eventCreatedAt = payload.pull_request.merged_at ?? null;
    } else if (payload.action === 'closed' && !payload.pull_request.merged) {
      mappedEventType = 'pr_closed';
      eventCreatedAt = payload.pull_request.closed_at ?? null;
    }

    if (mappedEventType) {
      extractPayload = {
        pr_number: payload.pull_request.number,
        title: payload.pull_request.title,
        url: payload.pull_request.html_url,
        additions: payload.pull_request.additions,
        deletions: payload.pull_request.deletions,
        changed_files: payload.pull_request.changed_files,
      };
      if (mappedEventType === 'pr_opened') extractPayload.body = payload.pull_request.body;
    }
  } else if (
    eventName === 'pull_request_review' &&
    payload.action === 'submitted' &&
    payload.pull_request &&
    payload.review
  ) {
    mappedEventType = 'review_submitted';
    eventCreatedAt = payload.review.submitted_at ?? null;
    extractPayload = {
      pr_number: payload.pull_request.number,
      state: payload.review.state,
      body: payload.review.body,
      word_count: payload.review.body ? payload.review.body.split(/\s+/).length : 0,
    };
  } else if (eventName === 'issues' && payload.issue) {
    if (payload.action === 'opened') {
      mappedEventType = 'issue_opened';
      eventCreatedAt = payload.issue.created_at ?? null;
    } else if (payload.action === 'closed') {
      mappedEventType = 'issue_closed';
      eventCreatedAt = payload.issue.closed_at ?? null;
    }

    if (mappedEventType) {
      extractPayload = {
        issue_number: payload.issue.number,
        title: payload.issue.title,
        labels: payload.issue.labels.map(label => label.name),
      };
      if (mappedEventType === 'issue_opened') extractPayload.body = payload.issue.body;
    }
  } else if (eventName === 'release' && payload.action === 'published' && payload.release) {
    mappedEventType = 'release';
    eventCreatedAt = payload.release.published_at ?? payload.release.created_at ?? null;
    extractPayload = {
      tag_name: payload.release.tag_name,
      name: payload.release.name,
      body: payload.release.body,
      url: payload.release.html_url,
    };
  }

  if (mappedEventType) {
    // Use the real GitHub event timestamp when available; fall back to now so
    // real-time webhook deliveries still record a sane time.
    const createdAt = eventCreatedAt ?? new Date().toISOString();
    await sql`
      INSERT INTO github_events (repo_id, contributor_id, event_type, payload, github_event_id, created_at)
      VALUES (${internalRepoId}, ${contributorId}, ${mappedEventType}, ${JSON.stringify(extractPayload)}, ${eventId}, ${createdAt})
      ON CONFLICT (github_event_id) DO NOTHING
    `;
  }
}

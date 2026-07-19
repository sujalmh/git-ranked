import { sql } from './db';

export async function handleWebhookEvent(eventName: string, payload: any, eventId: string) {
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
  if (eventName === 'installation' && payload.action === 'created') {
    const installId = payload.installation.id;
    const account = payload.installation.account;

    // Check if this GitHub account already has an app_user (install-after-login scenario)
    const existingUser = await sql`
      SELECT id FROM app_users WHERE github_id = ${account.id}
    `;
    const linkedUserId = existingUser.length > 0 ? existingUser[0].id : null;
    const status = linkedUserId ? 'active' : 'pending';

    await sql`
      INSERT INTO installations (
        github_installation_id, github_account_id, owner_login, owner_type,
        status, linked_user_id, updated_at
      )
      VALUES (
        ${installId}, ${account.id}, ${account.login}, ${account.type},
        ${status}, ${linkedUserId}, NOW()
      )
      ON CONFLICT (github_installation_id) DO UPDATE
      SET status = ${status},
          linked_user_id = COALESCE(installations.linked_user_id, ${linkedUserId}),
          owner_login = ${account.login},
          owner_type = ${account.type},
          github_account_id = ${account.id},
          updated_at = NOW()
    `;
    return;
  }

  // 2. Installation deleted
  if (eventName === 'installation' && payload.action === 'deleted') {
    const installId = payload.installation.id;
    await sql`
      UPDATE installations
      SET status = 'deleted', updated_at = NOW()
      WHERE github_installation_id = ${installId}
    `;
    return;
  }

  // 3. Installation Repositories added
  if (eventName === 'installation_repositories' && payload.action === 'added') {
    const installId = payload.installation.id;
    const dbInstall = await sql`SELECT id FROM installations WHERE github_installation_id = ${installId}`;
    if (dbInstall.length === 0) return;
    const internalInstallId = dbInstall[0].id;

    for (const repo of payload.repositories_added) {
      const [owner, name] = repo.full_name.split('/');
      await sql`
        INSERT INTO repositories (installation_id, github_repo_id, owner, name)
        VALUES (${internalInstallId}, ${repo.id}, ${owner}, ${name})
        ON CONFLICT (github_repo_id) DO UPDATE SET is_active = true
      `;
    }
    return;
  }

  // 4. Installation Repositories removed
  if (eventName === 'installation_repositories' && payload.action === 'removed') {
    for (const repo of payload.repositories_removed) {
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
  async function upsertContributor(sender: any): Promise<number | null> {
    if (!sender) return null;
    if (sender.type === 'Bot') return null;

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
  let extractPayload: any = {};

  if (eventName === 'push') {
    mappedEventType = 'push';
    extractPayload = {
      commits: payload.commits.map((c: any) => ({ sha: c.id, message: c.message, url: c.url })),
      branch: payload.ref,
      commit_count: payload.commits.length,
    };
  } else if (eventName === 'pull_request') {
    if (payload.action === 'opened') mappedEventType = 'pr_opened';
    else if (payload.action === 'closed' && payload.pull_request.merged) mappedEventType = 'pr_merged';
    else if (payload.action === 'closed' && !payload.pull_request.merged) mappedEventType = 'pr_closed';

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
  } else if (eventName === 'pull_request_review' && payload.action === 'submitted') {
    mappedEventType = 'review_submitted';
    extractPayload = {
      pr_number: payload.pull_request.number,
      state: payload.review.state,
      body: payload.review.body,
      word_count: payload.review.body ? payload.review.body.split(/\s+/).length : 0,
    };
  } else if (eventName === 'issues') {
    if (payload.action === 'opened') mappedEventType = 'issue_opened';
    else if (payload.action === 'closed') mappedEventType = 'issue_closed';

    if (mappedEventType) {
      extractPayload = {
        issue_number: payload.issue.number,
        title: payload.issue.title,
        labels: payload.issue.labels.map((l: any) => l.name),
      };
      if (mappedEventType === 'issue_opened') extractPayload.body = payload.issue.body;
    }
  } else if (eventName === 'release' && payload.action === 'published') {
    mappedEventType = 'release';
    extractPayload = {
      tag_name: payload.release.tag_name,
      name: payload.release.name,
      body: payload.release.body,
      url: payload.release.html_url,
    };
  }

  if (mappedEventType) {
    await sql`
      INSERT INTO github_events (repo_id, contributor_id, event_type, payload, github_event_id)
      VALUES (${internalRepoId}, ${contributorId}, ${mappedEventType}, ${JSON.stringify(extractPayload)}, ${eventId})
      ON CONFLICT (github_event_id) DO NOTHING
    `;
  }
}

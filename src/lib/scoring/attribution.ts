import { sql } from '../db';

/**
 * Commit author info stored on push event payloads. The webhook provides
 * `author.username` (sometimes absent); the commits API provides `id` + `login`;
 * both may carry `name`/`email`.
 */
export interface CommitAuthor {
  id?: number | null;
  login?: string | null;
  name?: string | null;
  email?: string | null;
}

/**
 * Collect every authored commit across all events in a candidate so a merged PR
 * (which absorbs its branch pushes) credits everyone who wrote code, not just
 * the person who opened it.
 */
export function collectCommitAuthors(events: Array<Record<string, unknown>>): CommitAuthor[] {
  const authors: CommitAuthor[] = [];
  for (const event of events) {
    const payload = (event.payload || {}) as Record<string, unknown>;
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    for (const c of commits) {
      if (c && typeof c === 'object') {
        const author = (c as Record<string, unknown>).author;
        if (author && typeof author === 'object') {
          authors.push(author as CommitAuthor);
        }
      }
    }
  }
  return authors;
}

/**
 * Pure attribution math: distribute credit proportional to authored commits.
 *
 * - The primary contributor (PR opener / pusher / issue closer) always receives
 *   a floor credit for the candidate's lifecycle.
 * - Each commit's author receives +1 credit. Authors the resolver cannot map to
 *   a contributor fall back to the primary contributor so no work is lost.
 * - With no commit-author data, all credit goes to the primary contributor.
 *
 * Returns a Map<contributorId, weight> that sums to exactly 1.
 */
export function computeAttributionWeights(
  authors: CommitAuthor[],
  resolveAuthor: (author: CommitAuthor) => number | null,
  primaryContributorId: number
): Map<number, number> {
  const credits = new Map<number, number>();
  credits.set(primaryContributorId, 1);

  if (authors.length > 0) {
    for (const author of authors) {
      const cid = resolveAuthor(author) ?? primaryContributorId;
      credits.set(cid, (credits.get(cid) ?? 0) + 1);
    }
  }

  const total = Array.from(credits.values()).reduce((a, b) => a + b, 0);
  const weights = new Map<number, number>();
  for (const [cid, count] of credits) {
    weights.set(cid, Math.round((count / total) * 1000) / 1000);
  }

  // Force exact normalisation to 1.0 (rounding can leave the sum at 0.999/1.001).
  const sum = Array.from(weights.values()).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) {
    const firstKey = Array.from(weights.keys())[0];
    weights.set(firstKey, Math.round((weights.get(firstKey)! + (1 - sum)) * 1000) / 1000);
  }

  return weights;
}

/**
 * Resolve a candidate's work to per-contributor attribution weights (sum to 1).
 * Authors are matched against known contributors by github_id, then username,
 * then email; unmatched authors fall back to the primary contributor.
 */
export async function resolveAttribution(
  events: Array<Record<string, unknown>>,
  primaryContributorId: number
): Promise<Map<number, number>> {
  const authors = collectCommitAuthors(events);
  if (authors.length === 0) {
    return new Map([[primaryContributorId, 1]]);
  }

  const ids: number[] = [];
  const usernames: string[] = [];
  const emails: string[] = [];

  for (const a of authors) {
    if (typeof a.id === 'number') ids.push(a.id);
    if (typeof a.login === 'string' && a.login) usernames.push(a.login);
    if (typeof a.email === 'string' && a.email) emails.push(a.email);
  }

  const resolved = new Map<string, number>();
  if (ids.length > 0 || usernames.length > 0 || emails.length > 0) {
    // Email resolution depends on the `github_contributors.email` migration;
    // fall back to id/username matching if the column isn't present yet.
    let rows: Array<{ id: number; github_id: number | null; username: string | null; email: string | null }> = [];
    try {
      rows = (await sql`
        SELECT id, github_id, username, email
        FROM github_contributors
        WHERE github_id = ANY(${ids}::bigint[])
           OR username = ANY(${usernames}::text[])
           OR email = ANY(${emails}::text[])
      `) as Array<{ id: number; github_id: number | null; username: string | null; email: string | null }>;
    } catch {
      rows = (await sql`
        SELECT id, github_id, username, NULL AS email
        FROM github_contributors
        WHERE github_id = ANY(${ids}::bigint[])
           OR username = ANY(${usernames}::text[])
      `) as Array<{ id: number; github_id: number | null; username: string | null; email: string | null }>;
    }
    for (const row of rows) {
      const cid = row.id;
      if (row.github_id != null) resolved.set(`id:${row.github_id}`, cid);
      if (row.username) resolved.set(`u:${row.username}`, cid);
      if (row.email) resolved.set(`e:${row.email}`, cid);
    }
  }

  const resolveAuthor = (author: CommitAuthor): number | null => {
    if (typeof author.id === 'number' && resolved.has(`id:${author.id}`)) {
      return resolved.get(`id:${author.id}`)!;
    }
    if (author.login && resolved.has(`u:${author.login}`)) {
      return resolved.get(`u:${author.login}`)!;
    }
    if (author.email && resolved.has(`e:${author.email}`)) {
      return resolved.get(`e:${author.email}`)!;
    }
    return null;
  };

  return computeAttributionWeights(authors, resolveAuthor, primaryContributorId);
}

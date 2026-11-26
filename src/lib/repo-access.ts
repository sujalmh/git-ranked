import { cache } from 'react';
import { sql } from './db';

export type RepoRecord = {
  id: number;
  github_repo_id: number;
  github_installation_id: number | string | null;
  is_public: boolean;
  share_enabled: boolean;
  public_enabled: boolean;
  added_by_user_id: number | null;
};

export async function getRepoRecord(owner: string, name: string): Promise<RepoRecord | null> {
  const rows = await sql`
    SELECT r.id, r.github_repo_id, r.share_enabled, r.public_enabled, r.added_by_user_id,
           i.github_installation_id,
           (r.installation_id IS NULL) as is_public
    FROM repositories r
    LEFT JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name}
    LIMIT 1
  `;
  return rows.length > 0 ? (rows[0] as RepoRecord) : null;
}

export async function getRepoRecordById(repoId: number): Promise<RepoRecord | null> {
  const rows = await sql`
    SELECT r.id, r.github_repo_id, r.share_enabled, r.public_enabled, r.added_by_user_id,
           i.github_installation_id,
           (r.installation_id IS NULL) as is_public
    FROM repositories r
    LEFT JOIN installations i ON r.installation_id = i.id
    WHERE r.id = ${repoId}
    LIMIT 1
  `;
  return rows.length > 0 ? (rows[0] as RepoRecord) : null;
}

/**
 * A repo is managed by a user if it is linked to their GitHub App
 * installation OR the user added it as a public repo. Previously the
 * predicate `r.installation_id IS NULL` matched EVERY public repo for EVERY
 * user — which let any authenticated user classify/analyse/remove repos that
 * another user added.
 */
export async function isRepoOwnedByUser(repoId: number, userId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1
    FROM repositories r
    LEFT JOIN installations i ON r.installation_id = i.id
    WHERE r.id = ${repoId}
      AND (i.linked_user_id = ${userId} OR r.added_by_user_id = ${userId})
  `;
  return rows.length > 0;
}

/**
 * The public showcase page is only available for active repositories that are
 * either untracked public repos (no installation) or explicitly made public by
 * their owner. Cached per request so page + metadata share one query.
 */
export const getPublicRepoId = cache(async (owner: string, name: string): Promise<number | null> => {
  const rows = await sql`
    SELECT id FROM repositories
    WHERE owner = ${owner} AND name = ${name}
      AND (installation_id IS NULL OR public_enabled = true)
      AND is_active = true
    LIMIT 1
  `;
  return rows.length > 0 ? (rows[0].id as number) : null;
});

export type OwnedRepoRecord = {
  id: number;
  github_repo_id: number;
  default_branch: string | null;
  installation_id: number | null;
  github_installation_id: number | string | null;
  install_status: string | null;
};

/**
 * Repository lookup for the authenticated /repos workspace. Cached per request
 * so the segment layout can reject unknown/unauthorized repos before the page's
 * loading boundary streams, and the page can reuse the same row.
 */
export const getOwnedRepo = cache(
  async (owner: string, name: string, userId: string | number): Promise<OwnedRepoRecord | null> => {
    const rows = await sql`
      SELECT r.id, r.github_repo_id, r.default_branch, r.installation_id,
             i.github_installation_id, i.status as install_status
      FROM repositories r
      LEFT JOIN installations i ON r.installation_id = i.id
      WHERE r.owner = ${owner} AND r.name = ${name}
        AND (i.linked_user_id = ${userId} OR r.added_by_user_id = ${userId})
      LIMIT 1
    `;
    return rows.length > 0 ? (rows[0] as OwnedRepoRecord) : null;
  }
);

export async function getUserRepoId(owner: string, name: string, userId: string): Promise<number | null> {
  const rows = await sql`
    SELECT r.id
    FROM repositories r
    LEFT JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name}
      AND (i.linked_user_id = ${userId} OR r.added_by_user_id = ${userId})
      AND r.is_active = true
    LIMIT 1
  `;
  return rows.length > 0 ? (rows[0].id as number) : null;
}

import { sql } from './db';

const ADMIN_GITHUB_USERNAMES = (process.env.ADMIN_GITHUB_USERNAMES || 'sujalmh')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * Authorize a GitHub App installation user as an admin. The identity is the
 * GitHub account (not the app_users.id) so it stays stable across sign-ins.
 * Configurable via ADMIN_GITHUB_USERNAMES (comma-separated).
 */
export async function isAdminGithubId(githubId?: number | string | null): Promise<boolean> {
  if (!githubId) return false;
  const numericId = typeof githubId === 'string' ? Number(githubId) : githubId;
  if (!Number.isInteger(numericId)) return false;

  const rows = await sql`
    SELECT username FROM app_users WHERE github_id = ${numericId}
  `;
  if (rows.length === 0) return false;
  return ADMIN_GITHUB_USERNAMES.includes(String(rows[0].username).toLowerCase());
}

export { ADMIN_GITHUB_USERNAMES };

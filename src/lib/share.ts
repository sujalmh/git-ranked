import { randomBytes } from 'crypto';
import { sql } from './db';

export type ShareTokenRow = {
  id: number;
  owner: string;
  name: string;
  share_token: string;
  share_enabled: boolean;
};

function generateToken(): string {
  return randomBytes(16).toString('hex');
}

export async function ensureShareToken(repoId: number): Promise<string> {
  const existing = await sql`
    SELECT share_token FROM repositories
    WHERE id = ${repoId} AND share_token IS NOT NULL
  `;
  if (existing.length > 0 && existing[0].share_token) {
    await sql`
      UPDATE repositories SET share_enabled = true WHERE id = ${repoId}
    `;
    return existing[0].share_token as string;
  }

  const token = generateToken();
  await sql`
    UPDATE repositories
    SET share_token = ${token}, share_enabled = true
    WHERE id = ${repoId}
  `;
  return token;
}

export async function revokeShareToken(repoId: number): Promise<void> {
  await sql`
    UPDATE repositories
    SET share_enabled = false
    WHERE id = ${repoId}
  `;
}

export async function getRepoByShareToken(token: string): Promise<ShareTokenRow | null> {
  const rows = await sql`
    SELECT id, owner, name, share_token, share_enabled
    FROM repositories
    WHERE share_token = ${token} AND share_enabled = true AND is_active = true
  `;
  if (rows.length === 0) return null;
  return rows[0] as ShareTokenRow;
}

export async function getShareState(repoId: number): Promise<{ token: string | null; enabled: boolean }> {
  const rows = await sql`
    SELECT share_token, share_enabled FROM repositories WHERE id = ${repoId}
  `;
  if (rows.length === 0) return { token: null, enabled: false };
  return {
    token: (rows[0].share_token as string | null) ?? null,
    enabled: Boolean(rows[0].share_enabled),
  };
}

export async function getPublicState(repoId: number): Promise<{ enabled: boolean }> {
  const rows = await sql`
    SELECT public_enabled FROM repositories WHERE id = ${repoId}
  `;
  return { enabled: rows.length > 0 ? Boolean(rows[0].public_enabled) : false };
}

export async function setRepoPublic(repoId: number): Promise<void> {
  await sql`
    UPDATE repositories SET public_enabled = true WHERE id = ${repoId}
  `;
}

export async function revokeRepoPublic(repoId: number): Promise<void> {
  await sql`
    UPDATE repositories SET public_enabled = false WHERE id = ${repoId}
  `;
}

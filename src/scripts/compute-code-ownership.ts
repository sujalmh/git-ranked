/**
 * Compute git-blame code ownership per contributor for a repo and store it in
 * `contributor_code_ownership`. The share is the fraction of the repo's final
 * (HEAD) code lines each contributor currently owns, resolved via:
 *   1. GitHub noreply emails (embed github_id), then
 *   2. normalized author name / email-prefix vs contributor username.
 *
 * Scoring blends this share into impact only when a row exists, so repos
 * without ownership data are unchanged.
 *
 * Usage: npx tsx src/scripts/compute-code-ownership.ts [repoId] [--dir=/path/to/clone]
 *
 * NOTE: app modules must be imported AFTER dotenv loads .env.local.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const CODE_EXTENSIONS = new Set(['.py', '.tsx', '.ts', '.js', '.jsx']);

function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 128 * 1024 * 1024 });
  return stdout as string;
}

function parseNoreplyGithubId(email: string): number | null {
  const m = email.match(/^(\d+)\+[^@]+@users\.noreply\.github\.com$/i);
  return m ? Number(m[1]) : null;
}

/** Resolve a blame author (name + email) to a contributor id, or null. */
function resolveContributor(
  name: string,
  email: string,
  byGithubId: Map<string, number>,
  byNormUsername: Map<string, number>
): number | null {
  const gid = parseNoreplyGithubId(email);
  if (gid !== null && byGithubId.has(String(gid))) return byGithubId.get(String(gid))!;

  const normName = normalizeId(name);
  if (byNormUsername.has(normName)) return byNormUsername.get(normName)!;

  const emailPrefix = email.split('@')[0];
  const normEmail = normalizeId(emailPrefix);
  if (normEmail && byNormUsername.has(normEmail)) return byNormUsername.get(normEmail)!;

  // Unique prefix fallback (len >= 4): 'sujan' → 'sujan...', 'sujalmh9' → 'sujalmh'.
  const candidates = new Set<number>();
  for (const [normUser, cid] of byNormUsername) {
    if (normUser.length >= 4 && (normUser.startsWith(normName) || (normName.length >= 4 && normName.startsWith(normUser)) || (normEmail.length >= 4 && (normEmail.startsWith(normUser) || normUser.startsWith(normEmail))))) {
      candidates.add(cid);
    }
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}

async function main() {
  const { sql } = await import('../lib/db');
  const { mkdtempSync, rmSync, existsSync } = await import('fs');
  const { join } = await import('path');
  const { tmpdir } = await import('os');

  const repoId = Number(process.argv[2] ?? 5);
  const dirArg = process.argv.find((a) => a.startsWith('--dir='));
  const externalDir = dirArg ? dirArg.split('=')[1] : null;

  const repoRows = await sql`SELECT owner, name FROM repositories WHERE id = ${repoId}`;
  if (repoRows.length === 0) {
    console.error(`Repo ${repoId} not found.`);
    process.exit(1);
  }
  const owner = String(repoRows[0].owner);
  const name = String(repoRows[0].name);

  const contributors = await sql`
    SELECT id, username, github_id FROM github_contributors
    WHERE id IN (SELECT DISTINCT contributor_id FROM github_events WHERE repo_id = ${repoId})
  `;
  const byGithubId = new Map<string, number>();
  const byNormUsername = new Map<string, number>();
  for (const c of contributors) {
    const cid = Number(c.id);
    if (c.github_id != null) byGithubId.set(String(c.github_id), cid);
    const nu = normalizeId(String(c.username ?? ''));
    if (nu && !byNormUsername.has(nu)) byNormUsername.set(nu, cid);
  }
  console.log(`Resolving against ${contributors.length} repo contributors (${byNormUsername.size} unique normalized usernames).`);

  const cloneDir = externalDir ?? mkdtempSync(join(tmpdir(), 'ownership-'));
  const isClone = !externalDir;
  if (isClone) {
    console.log(`Cloning ${owner}/${name} into ${cloneDir}...`);
    try {
      await runGit(cloneDir, ['clone', '--quiet', `https://github.com/${owner}/${name}.git`, '.']);
    } catch (err) {
      console.error('Clone failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  } else if (!existsSync(join(externalDir, '.git'))) {
    console.error(`--dir=${externalDir} is not a git repo.`);
    process.exit(1);
  }

  const files = (await runGit(cloneDir, ['ls-tree', '-r', 'HEAD', '--name-only']))
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => {
      if (!f) return false;
      const ext = '.' + f.split('.').pop();
      return CODE_EXTENSIONS.has(ext);
    });

  console.log(`Blaming ${files.length} code files...`);
  const linesByAuthor = new Map<string, { name: string; email: string; lines: number }>();
  let totalLines = 0;

  for (const file of files) {
    const out = await runGit(cloneDir, ['blame', '--line-porcelain', 'HEAD', '--', file]).catch(() => '');
    let author = '';
    let email = '';
    for (const line of out.split('\n')) {
      if (line.startsWith('author ')) {
        author = line.slice('author '.length);
      } else if (line.startsWith('author-mail ')) {
        email = line.slice('author-mail '.length).replace(/[<>]/g, '');
        const key = `${author}\u0000${email}`;
        const entry = linesByAuthor.get(key) ?? { name: author, email, lines: 0 };
        entry.lines++;
        linesByAuthor.set(key, entry);
        totalLines++;
      }
    }
  }

  const contribLines = new Map<number, number>();
  let unresolved = 0;
  for (const entry of linesByAuthor.values()) {
    const cid = resolveContributor(entry.name, entry.email, byGithubId, byNormUsername);
    if (cid === null) {
      unresolved += entry.lines;
      continue;
    }
    contribLines.set(cid, (contribLines.get(cid) ?? 0) + entry.lines);
  }

  // Delete stale rows, then write fresh ownership for this repo.
  await sql`DELETE FROM contributor_code_ownership WHERE repo_id = ${repoId}`;
  for (const [cid, lines] of contribLines) {
    const share = totalLines > 0 ? lines / totalLines : 0;
    await sql`
      INSERT INTO contributor_code_ownership (contributor_id, repo_id, code_lines, share, total_code_lines, computed_at)
      VALUES (${cid}, ${repoId}, ${lines}, ${share}, ${totalLines}, NOW())
    `;
  }

  console.log(`\nCode ownership for ${owner}/${name} (${totalLines} code lines at HEAD, ${unresolved} unresolved):`);
  for (const [cid, lines] of [...contribLines.entries()].sort((a, b) => b[1] - a[1])) {
    const c = contributors.find((row) => Number(row.id) === cid);
    console.log(`  ${String(c?.username ?? cid).padEnd(16)} ${String(lines).padStart(7)} lines  ${(100 * lines / totalLines).toFixed(1)}%`);
  }

  if (isClone) {
    try { rmSync(cloneDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

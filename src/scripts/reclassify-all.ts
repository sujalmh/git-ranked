/**
 * Re-run work-unit extraction + scoring for every active repo, then refresh the
 * deterministic health metrics cache. Used after a scoring-system upgrade so
 * candidates, attribution, percentiles, and the repo score all reflect the new
 * rules. Bounded (optionally by repoId) and safe to run repeatedly.
 *
 * Usage: npx tsx src/scripts/reclassify-all.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { sql } from '../lib/db';
import { classifyRepo, scoreRepo } from '../lib/scoring';
import { generateRepoInsights } from '../lib/insights';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  // Optional repo-id sharding: `npx tsx reclassify-all.ts 2 8 10` reclassifies
  // only those repos. With no args, every active repo is processed (sequential).
  const explicitIds = process.argv
    .slice(2)
    .map((a) => Number(a))
    .filter((n) => Number.isFinite(n));

  const repoRows = explicitIds.length
    ? await sql`
        SELECT id, owner, name FROM repositories
        WHERE is_active = true AND id = ANY(${explicitIds}::int[])
        ORDER BY id ASC
      `
    : await sql`
        SELECT id, owner, name FROM repositories
        WHERE is_active = true
        ORDER BY id ASC
      `;

  if (repoRows.length === 0) {
    console.log('No active repositories to reclassify.');
    process.exit(0);
  }

  console.log(`Reclassifying ${repoRows.length} active repos...\n`);

  let failed = 0;
  for (const repo of repoRows) {
    const repoId = repo.id as number;
    const label = `${repo.owner}/${repo.name}`;
    try {
      await sql`UPDATE work_unit_candidates SET status = 'needs_reclassification', classified_at = NULL WHERE repo_id = ${repoId}`;

      const totalUnits = await classifyRepo(repoId);
      const scores = await scoreRepo(repoId);
      await generateRepoInsights(repoId);

      console.log(`  ✅ ${label} (id ${repoId}): ${totalUnits} work units, ${scores.length} scored contributors`);
    } catch (err) {
      failed++;
      console.error(`  ❌ ${label} (id ${repoId}) failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nDone. ${repoRows.length - failed}/${repoRows.length} repos reclassified.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Reclassification failed:', err);
  process.exit(1);
});

/**
 * Classify any remaining pending work-unit candidates (stragglers left after a
 * bulk reclassify run when some AI calls exhausted retries) and rescore.
 * classifyRepo only touches pending / needs_reclassification candidates, so this
 * is cheap — it never re-wipes already-classified work.
 *
 * Usage: npx tsx src/scripts/classify-pending.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { sql } from '../lib/db';
import { classifyRepo, scoreRepo } from '../lib/scoring';
import { generateRepoInsights } from '../lib/insights';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const repos = await sql`
    SELECT DISTINCT repo_id, COUNT(*)::int AS pending
    FROM work_unit_candidates
    WHERE status = 'pending'
    GROUP BY repo_id
    ORDER BY repo_id
  `;

  if (repos.length === 0) {
    console.log('No pending candidates.');
    process.exit(0);
  }

  console.log(`Found pending candidates in ${repos.length} repos:\n`);
  for (const repo of repos) {
    const repoId = repo.repo_id as number;
    try {
      const units = await classifyRepo(repoId);
      await scoreRepo(repoId);
      await generateRepoInsights(repoId);
      console.log(`  ✅ repo ${repoId}: classified ${units} straggler units, rescaled + health refreshed`);
    } catch (err) {
      console.error(`  ❌ repo ${repoId} failed:`, err instanceof Error ? err.message : err);
    }
  }

  const remaining = await sql`SELECT COUNT(*)::int AS n FROM work_unit_candidates WHERE status='pending'`;
  console.log(`\nRemaining pending candidates: ${remaining[0].n}`);
  process.exitCode = remaining[0].n > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});

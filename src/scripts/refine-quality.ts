/**
 * Run the granularity-refinement quality job for a repo (or all active repos).
 * Audit -> enqueue flagged over-broad units -> split them into specific units
 * (credit-conserving) -> rescore.
 *
 * Usage:
 *   npx tsx src/scripts/refine-quality.ts [repoId] [--budget=N] [--dry-run]
 *   npx tsx src/scripts/refine-quality.ts --all [--budget=N]
 *
 * NOTE: app modules must be imported AFTER dotenv loads .env.local — the AI
 * provider/endpoint constants are read at module-evaluation time.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const budgetArg = args.find((a) => a.startsWith('--budget='));
  const budget = budgetArg ? Number(budgetArg.split('=')[1]) : undefined;
  const dryRun = args.includes('--dry-run');

  const { sql } = await import('../lib/db');
  const scoring = await import('../lib/scoring');

  const repoRows = all
    ? await sql`SELECT id, owner, name FROM repositories WHERE is_active = true ORDER BY id ASC`
    : await sql`SELECT id, owner, name FROM repositories WHERE id = ${Number(args[0] ?? 5)}`;

  if (repoRows.length === 0) {
    console.error('No repos to refine. Usage: npx tsx src/scripts/refine-quality.ts [repoId] [--all]');
    process.exit(1);
  }

  let totalEnqueued = 0;
  let totalRefined = 0;
  for (const repo of repoRows) {
    const repoId = Number(repo.id);
    const label = `${repo.owner}/${repo.name}`;
    console.log(`\n=== ${label} (repo ${repoId}) ===`);

    const enqueued = await scoring.enqueueGranularityRefinements(repoId);
    console.log(`  audited + enqueued ${enqueued} flagged units.`);
    totalEnqueued += enqueued;

    if (dryRun) {
      console.log(`  dry-run: skipping refinement + rescore.`);
      continue;
    }

    const refined = await scoring.processGranularityRefinements(repoId, undefined, { budget });
    console.log(`  refined ${refined} units.`);
    if (refined > 0) {
      await scoring.scoreRepo(repoId);
      console.log(`  rescaled.`);
    }
    totalRefined += refined;
  }

  console.log(`\nDone. Total enqueued: ${totalEnqueued}, refined: ${totalRefined}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Refinement quality job failed:', err);
  process.exit(1);
});

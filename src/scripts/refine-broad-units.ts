/**
 * Refine broad roll-up work units into specific topic units.
 *
 * Finds work units that collapsed multiple shipped capabilities into one broad
 * summary (system_wide scope, or long multi-topic summaries) and re-extracts
 * them at finer granularity, superseding the broad unit and chaining the
 * specific units to it via previous_unit_id.
 *
 * Usage: npx tsx src/scripts/refine-broad-units.ts [repoId] [--units=id1,id2] [--limit=N]
 *
 * NOTE: app modules must be imported AFTER dotenv loads .env.local — the AI
 * provider/endpoint constants are read at module-evaluation time, so static
 * imports before config() would send the OpenCode Go key to the OpenRouter
 * endpoint (401 Missing Authentication header).
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const { sql } = await import('../lib/db');
  const { refineBroadWorkUnits, scoreRepo } = await import('../lib/scoring');
  const { generateRepoInsights } = await import('../lib/insights');
  const args = process.argv.slice(2);
  const repoId = Number(args[0] ?? 4);
  const unitArg = args.find((a) => a.startsWith('--units='));
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const unitIds = unitArg ? unitArg.split('=')[1].split(',').map(Number).filter(Number.isFinite) : undefined;
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 50;

  if (!Number.isFinite(repoId)) {
    console.error('Usage: npx tsx src/scripts/refine-broad-units.ts [repoId] [--units=id1,id2] [--limit=N]');
    process.exit(1);
  }

  console.log(`Refining broad work units for repo ${repoId}...`);
  const refined = await refineBroadWorkUnits(repoId, undefined, { unitIds, limit });
  console.log(`Refined ${refined} broad work units.`);

  if (refined > 0) {
    console.log('\nRe-scoring repo...');
    const scores = await scoreRepo(repoId);
    console.log(`  Scored ${scores.length} contributor profiles.`);
    await generateRepoInsights(repoId);
  }

  const remaining = await sql`
    SELECT count(*) as n FROM work_units
    WHERE repo_id = ${repoId} AND COALESCE(unit_status, 'active') = 'active' AND work_type <> 'Review'
  `;
  console.log(`Active work units: ${remaining[0]?.n ?? 0}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Refinement failed:', err);
  process.exit(1);
});

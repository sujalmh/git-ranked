/**
 * Re-run work-unit extraction + scoring for a single repo.
 * Clears the classification cache and resets candidates so the improved
 * prompt runs fresh against all events.
 *
 * Usage: npx tsx src/scripts/reclassify-repo.ts [repoId]
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { sql } from '../lib/db';
import { classifyRepo, scoreRepo } from '../lib/scoring';
import { generateRepoInsights } from '../lib/insights';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const repoId = Number(process.argv[2] ?? 4);
  if (!Number.isFinite(repoId)) {
    console.error('Usage: npx tsx src/scripts/reclassify-repo.ts [repoId]');
    process.exit(1);
  }

  console.log(`Reclassifying repo ${repoId}...`);
  await sql`DELETE FROM classification_cache`;
  console.log('  Cache cleared.');

  console.log('Deleting existing work units...');
  await sql`DELETE FROM work_unit_contributors WHERE work_unit_id IN (SELECT id FROM work_units WHERE repo_id = ${repoId})`;
  await sql`DELETE FROM work_units WHERE repo_id = ${repoId}`;
  console.log('  Work units deleted.');

  console.log('Resetting candidate statuses to pending...');
  await sql`UPDATE work_unit_candidates SET status = 'pending', classified_at = NULL WHERE repo_id = ${repoId}`;
  console.log('  Candidates reset.');

  console.log('\nRunning classifyRepo...');
  const totalUnits = await classifyRepo(repoId);
  console.log(`  Extracted ${totalUnits} work units.`);

  console.log('\nRunning scoreRepo...');
  const scores = await scoreRepo(repoId);
  console.log(`  Scored ${scores.length} contributor profiles.`);

  console.log('\nRefreshing health metrics...');
  await generateRepoInsights(repoId);
  console.log('  Health metrics refreshed.');

  // Show the results
  console.log('\n' + '='.repeat(80));
  console.log('RESULTS — Work Units with Summaries');
  console.log('='.repeat(80));

  const wus = await sql`
    SELECT wu.id, wu.work_type, wu.summary, wu.extraction_source, wu.extraction_confidence,
           wu.size_metrics, wu.rationale,
           c.username
    FROM work_units wu
    JOIN work_unit_contributors wuc ON wu.id = wuc.work_unit_id
    JOIN github_contributors c ON wuc.contributor_id = c.id
    WHERE wu.repo_id = ${repoId}
    ORDER BY wu.created_at DESC
  `;

  for (const wu of wus) {
    console.log('\n---');
    console.log(`[${wu.work_type}] ${wu.summary || '(no summary)'}`);
    console.log(`  Source: ${wu.extraction_source} (${Math.round(wu.extraction_confidence * 100)}%)`);
    console.log(`  Contributor: ${wu.username}`);
    console.log(`  Size: ${JSON.stringify(wu.size_metrics)}`);
    console.log(`  Rationale: ${wu.rationale?.impact_reason}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log(`Total: ${wus.length} work units`);
  console.log('='.repeat(80));

  process.exit(0);
}

main().catch((err) => {
  console.error('Reclassification failed:', err);
  process.exit(1);
});

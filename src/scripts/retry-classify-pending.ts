/**
 * Resilient recovery for candidates left pending / needs_reclassification after
 * a bulk reclassify (the OpenRouter free-tier daily quota can be exhausted mid-
 * run, leaving stragglers). Loops until everything is classified or the timeout
 * elapses, sleeping between attempts so it self-heals once the quota resets.
 *
 * classifyRepo only touches pending / needs_reclassification candidates and the
 * classification cache absorbs unchanged content (no AI cost on re-runs), so
 * this is safe to run repeatedly.
 *
 * Usage: npx tsx src/scripts/retry-classify-pending.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { sql } from '../lib/db';
import { classifyRepo, scoreRepo } from '../lib/scoring';
import { generateRepoInsights } from '../lib/insights';

config({ path: resolve(process.cwd(), '.env.local') });

const SLEEP_MS = 30 * 60 * 1000;
const MAX_ELAPSED_MS = 24 * 60 * 60 * 1000;

async function pendingRepoIds(): Promise<number[]> {
  const rows = await sql`
    SELECT DISTINCT repo_id FROM work_unit_candidates
    WHERE status IN ('pending', 'needs_reclassification')
    ORDER BY repo_id
  `;
  return rows.map((r) => r.repo_id as number);
}

async function main() {
  const startedAt = Date.now();
  let attempts = 0;

  while (Date.now() - startedAt < MAX_ELAPSED_MS) {
    attempts++;
    const repoIds = await pendingRepoIds();

    if (repoIds.length === 0) {
      console.log(`All candidates classified after ${attempts} attempt(s).`);
      process.exit(0);
    }

    console.log(`\n[attempt ${attempts}] repos with pending/nrc candidates: ${repoIds.join(', ')}`);
    let anySucceeded = false;

    for (const repoId of repoIds) {
      try {
        const units = await classifyRepo(repoId);
        await scoreRepo(repoId);
        await generateRepoInsights(repoId);
        console.log(`  ✅ repo ${repoId}: classified ${units} units, rescaled + health refreshed`);
        anySucceeded = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRateLimit = /429|rate.limit|quota|timeout/i.test(msg);
        console.log(`  ⏳ repo ${repoId}: ${isRateLimit ? 'rate-limited/quota' : 'failed'}: ${msg.slice(0, 140)}`);
      }
    }

    if (!anySucceeded) {
      const remaining = await pendingRepoIds();
      if (remaining.length === 0) {
        console.log('All candidates classified.');
        process.exit(0);
      }
      console.log(`Still blocked (likely free-tier quota). Sleeping ${SLEEP_MS / 60000} min before retry...`);
      await new Promise((r) => setTimeout(r, SLEEP_MS));
    }
  }

  console.error('Timed out after 24h. Re-run this script to continue.');
  process.exitCode = 1;
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

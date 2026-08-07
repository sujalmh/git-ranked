/**
 * Auto-upgrade heuristic-fallback work units to AI ones across multiple days.
 *
 * The OpenRouter free-tier daily quota (~1000 requests) is much smaller than the
 * ~15k heuristic candidates, and attempting while it is exhausted only churns
 * the DB (re-flagging + heuristic re-extraction). This watcher therefore runs
 * bounded passes and sleeps until just after midnight UTC (when the free-tier
 * window resets) whenever a pass makes no progress — i.e. is rate-limited.
 *
 * Usage: npx tsx src/scripts/retry-upgrade.ts [repoId...] [--limit N]
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { sql } from '../lib/db';
import { upgradeHeuristicUnits } from './upgrade-heuristic-units';

config({ path: resolve(process.cwd(), '.env.local') });

const MAX_ELAPSED_MS = 5 * 24 * 60 * 60 * 1000; // up to 5 days
const DEFAULT_LIMIT = 150;

async function remainingHeuristic(): Promise<number> {
  const r = await sql`SELECT COUNT(DISTINCT wu.candidate_id)::int AS n FROM work_units wu WHERE wu.extraction_source = 'heuristic_fallback'`;
  return r[0].n;
}

function msUntilNextWindow(afterMinutes = 6): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(0, afterMinutes, 0, 0); // just after midnight UTC
  let delay = next.getTime() - now.getTime();
  if (delay <= 0) delay += 24 * 60 * 60 * 1000;
  return delay;
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : DEFAULT_LIMIT;
  const repoIds = args
    .slice(0, limitIdx >= 0 ? limitIdx : args.length)
    .map(Number)
    .filter((n) => Number.isFinite(n));

  const startedAt = Date.now();
  let attempts = 0;

  while (Date.now() - startedAt < MAX_ELAPSED_MS) {
    attempts++;
    const remaining = await remainingHeuristic();
    if (remaining === 0) {
      console.log(`All heuristic units upgraded after ${attempts} attempt(s).`);
      process.exit(0);
    }

    console.log(`\n[attempt ${attempts}] heuristic candidates remaining: ${remaining}`);
    const before = remaining;
    const res = await upgradeHeuristicUnits(repoIds.length ? repoIds : undefined, limit);
    const upgraded = before - res.remaining;

    if (upgraded > 0) {
      console.log(`Upgraded ${upgraded} candidates this pass. Continuing...`);
      continue; // quota still available — keep grinding
    }

    // No progress → rate-limited. Sleep until the next free-tier window.
    const delayMs = msUntilNextWindow();
    console.log(`No progress (${res.flagged} flagged, rate-limited). Sleeping ${Math.round(delayMs / 3.6e6 * 10) / 10}h until next free-tier window...`);
    await new Promise((r) => setTimeout(r, delayMs));
  }

  console.error('Timed out after 5 days. Re-run this script to continue.');
  process.exitCode = 1;
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

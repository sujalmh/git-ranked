/**
 * Upgrade heuristic-fallback work units to AI-classified ones.
 *
 * During bulk reclassification an AI provider quota can be exhausted,
 * so extraction falls back to keyword heuristics. Those candidates still carry
 * valid (deterministic) facts, but AI produces more meaningful ones — and the
 * value model scores AI facts ~10-30% higher, so all-heuristic repos are
 * under-scored relative to all-AI repos. Re-flagging them and re-running
 * classifyRepo lets the classification_cache restore cached AI responses for
 * free; genuinely-uncached candidates need fresh AI calls.
 *
 * `limit` bounds how many candidates are re-flagged per repo per run, so the
 * retry watcher never re-processes the whole corpus on a rate-limited attempt.
 *
 * Usage:
 *   npx tsx src/scripts/upgrade-heuristic-units.ts [repoId...] [--limit N]
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const DEFAULT_LIMIT = 150;

export async function upgradeHeuristicUnits(
  repoIds?: number[],
  limit: number = DEFAULT_LIMIT
): Promise<{ repos: number; flagged: number; remaining: number }> {
  const { sql } = await import('../lib/db');
  const { classifyRepo, scoreRepo } = await import('../lib/scoring');
  const { generateRepoInsights } = await import('../lib/insights');

  const repos = repoIds?.length
    ? await sql`
        SELECT DISTINCT wu.repo_id
        FROM work_units wu
        JOIN repositories r ON r.id = wu.repo_id
        WHERE wu.extraction_source = 'heuristic_fallback'
          AND r.is_active = true
          AND wu.repo_id = ANY(${repoIds}::int[])
        ORDER BY wu.repo_id
      `
    : await sql`
        SELECT DISTINCT wu.repo_id
        FROM work_units wu
        JOIN repositories r ON r.id = wu.repo_id
        WHERE wu.extraction_source = 'heuristic_fallback'
          AND r.is_active = true
        ORDER BY wu.repo_id
      `;

  let totalFlagged = 0;

  for (const row of repos) {
    const repoId = row.repo_id as number;
    try {
      const flagged = await sql`
        UPDATE work_unit_candidates c
        SET status = CASE WHEN c.status = 'classified' THEN 'needs_reclassification' ELSE c.status END
        WHERE c.id IN (
          SELECT id FROM work_unit_candidates
          WHERE repo_id = ${repoId}
            AND status IN ('classified', 'needs_reclassification', 'pending')
            AND id IN (
              SELECT wu.candidate_id FROM work_units wu
              WHERE wu.repo_id = ${repoId}
                AND COALESCE(wu.unit_status, 'active') = 'active'
              GROUP BY wu.candidate_id
              HAVING bool_and(wu.extraction_source = 'heuristic_fallback')
            )
          ORDER BY id
          LIMIT ${limit}
        )
        RETURNING id
      `;

      if (flagged.length > 0) {
        await classifyRepo(repoId);
        await scoreRepo(repoId);
        await generateRepoInsights(repoId);
        totalFlagged += flagged.length;

        const mix = await sql`
          SELECT wu.extraction_source, COUNT(*) AS n
          FROM work_units wu WHERE wu.repo_id = ${repoId}
            AND COALESCE(wu.unit_status, 'active') = 'active'
          GROUP BY wu.extraction_source ORDER BY n DESC
        `;
        console.log(`  repo ${repoId}: upgraded ${flagged.length}, mix=${mix.map((m) => `${m.extraction_source}=${m.n}`).join(', ')}`);
      }

      // Normalize any leftover in-flight flags: candidates whose units survived a
      // partial pass are already consistent; unit-less ones need re-extraction and
      // are dropped back to pending so the next classifyRepo pass picks them up.
      await sql`
        UPDATE work_unit_candidates c
        SET status = CASE
              WHEN EXISTS (SELECT 1 FROM work_units wu WHERE wu.candidate_id = c.id AND COALESCE(wu.unit_status, 'active') = 'active') THEN 'classified'
          ELSE 'pending'
        END
        WHERE c.repo_id = ${repoId} AND c.status = 'needs_reclassification'
      `;
    } catch (err) {
      console.warn(`  repo ${repoId} failed:`, err instanceof Error ? err.message.slice(0, 140) : err);
    }
  }

  const remaining = await sql`SELECT COUNT(DISTINCT wu.candidate_id)::int AS n FROM work_units wu WHERE wu.extraction_source = 'heuristic_fallback' AND COALESCE(wu.unit_status, 'active') = 'active'`;
  return { repos: repos.length, flagged: totalFlagged, remaining: remaining[0].n };
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : DEFAULT_LIMIT;
  const repoIds = args
    .slice(0, limitIdx >= 0 ? limitIdx : args.length)
    .map(Number)
    .filter((n) => Number.isFinite(n));

  const res = await upgradeHeuristicUnits(repoIds.length ? repoIds : undefined, limit);
  console.log(`\nDone. Repos processed: ${res.repos}, candidates upgraded: ${res.flagged}, heuristic candidates remaining: ${res.remaining}`);
  process.exitCode = res.remaining > 0 ? 1 : 0;
}

const isMain = (): boolean => {
  const argv1 = process.argv[1] ?? '';
  return argv1.endsWith('upgrade-heuristic-units.ts');
};

if (isMain()) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}

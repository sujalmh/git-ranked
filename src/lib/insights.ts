import { sql } from './db';
import { computeHealthMetrics, type HealthMetrics } from './scoring/repo-score';
import { roleMultiplier } from './scoring/scoring-engine';

export type { HealthMetrics } from './scoring/repo-score';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const MS_PER_DAY = 86_400_000;

function asPayload(payload: unknown): Record<string, unknown> {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
}

export async function generateRepoInsights(repoId: number) {
  // Health is measured over the observed activity window (30 days). Delivery and
  // Code Quality now come from the SAME work-unit value model that powers
  // contributor scores, so the repo number is consistent with the people inside
  // it; volume-only event counts are used as a fallback before classification
  // has run. All metrics are honest 0-100 scores — no hard floors that make
  // inactive repos look artificially healthy.
  const events = await sql`
    SELECT event_type, payload, contributor_id, created_at
    FROM github_events
    WHERE repo_id = ${repoId} AND created_at > NOW() - INTERVAL '30 days'
  `;

  let prsMerged = 0;
  let prsOpened = 0;
  let pushes = 0;
  let reviews = 0;
  let releases = 0;
  let fixes = 0;

  const contributorActivity: Record<number, number> = {};
  const reviewerIds = new Set<number>();
  const activeDays = new Set<string>();
  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const e of events) {
    const type = e.event_type;
    const payload = asPayload(e.payload);
    const cid = e.contributor_id as number;

    contributorActivity[cid] = (contributorActivity[cid] || 0) + 1;

    const ts = new Date(e.created_at).getTime();
    if (Number.isFinite(ts)) {
      if (ts < minTime) minTime = ts;
      if (ts > maxTime) maxTime = ts;
    }
    activeDays.add(new Date(e.created_at).toISOString().split('T')[0]);

    if (type === 'pr_merged') prsMerged++;
    if (type === 'pr_opened') prsOpened++;
    if (type === 'push') pushes++;
    if (type === 'review_submitted') {
      reviews++;
      reviewerIds.add(cid);
    }
    if (type === 'release') releases++;

    const title = (
      typeof payload.title === 'string' ? payload.title :
      typeof payload.message === 'string' ? payload.message :
      ''
    ).toLowerCase();

    if (type === 'pr_merged' || type === 'push') {
      if (['fix', 'bug', 'error', 'refactor'].some((w) => title.includes(w))) {
        fixes++;
      }
    }
  }

  const totalEvents = events.length;
  const activeContributors = Object.keys(contributorActivity).length;

  const spanDays =
    Number.isFinite(minTime) && Number.isFinite(maxTime)
      ? Math.max(1, Math.round((maxTime - minTime) / MS_PER_DAY) + 1)
      : activeDays.size || 1;
  const consistencyRatio = activeDays.size / spanDays;

  // ── Work-unit derived delivery & quality (shared with user scoring) ───────
  let deliveredValue = 0;
  let unitCount = 0;
  let qualitySum = 0;
  let qualityCount = 0;
  let testDocCount = 0;
  let wuContributors = 0;
  try {
    const [unitRows, contributorRows] = await Promise.all([
      sql`
        SELECT (derived->>'value')::numeric AS value,
               (derived->>'execution_quality')::numeric AS quality,
               (facts->>'testing_added')::boolean AS testing,
               (facts->>'documentation_updated')::boolean AS docs,
               role
        FROM work_units
        WHERE repo_id = ${repoId}
          AND shipped = true
          AND COALESCE(unit_status, 'active') = 'active'
          AND shipped_at > NOW() - INTERVAL '30 days'
      `,
      sql`
        SELECT COUNT(DISTINCT wuc.contributor_id) AS n
        FROM work_units wu
        JOIN work_unit_contributors wuc ON wu.id = wuc.work_unit_id
        WHERE wu.repo_id = ${repoId}
          AND wu.shipped = true
          AND COALESCE(wu.unit_status, 'active') = 'active'
          AND wu.shipped_at > NOW() - INTERVAL '30 days'
      `,
    ]);
    for (const r of unitRows) {
      const value = Number(r.value ?? 0) * roleMultiplier(r.role);
      if (Number.isFinite(value)) deliveredValue += value;
      unitCount++;
      const q = Number(r.quality ?? 3);
      if (Number.isFinite(q)) {
        qualitySum += q;
        qualityCount++;
      }
      if (r.testing || r.docs) testDocCount++;
    }
    wuContributors = Number(contributorRows[0]?.n ?? 0);
  } catch {
    /* work units may not be classified yet — fall back to event signals */
  }

  // 1-5. Deterministic repo scoring from the work-unit value model (delivery +
  // quality) blended with event-derived collaboration / review / knowledge
  // signals. All metrics are honest 0-100 scores with no hard floors.
  const totalActivity = Object.values(contributorActivity).reduce((a, b) => a + b, 0);
  const maxActivity = totalActivity > 0 ? Math.max(...Object.values(contributorActivity)) : 0;
  const busFactor = totalActivity > 0 ? maxActivity / totalActivity : 1;

  const metrics = computeHealthMetrics({
    prsMerged,
    prsOpened,
    pushes,
    reviews,
    releases,
    fixes,
    activeContributors,
    reviewerCount: reviewerIds.size,
    consistencyRatio,
    deliveredValue,
    unitCount,
    wuContributors,
    qualitySum,
    qualityCount,
    testDocCount,
    totalEvents,
    evenness: clamp(1 - busFactor),
  });

  // Cache it with a versioned prompt_version so readers can invalidate
  // caches produced by older formulas. Health rows are repo-scoped
  // (contributor_id NULL), so the conflict target is the partial unique index
  // that makes them dedupe correctly (a plain (repo_id, contributor_id,
  // insight_type) constraint treats NULLs as distinct and never conflicts).
  try {
    await sql`
      INSERT INTO insight_caches (repo_id, contributor_id, insight_type, payload, schema_version, prompt_version, confidence, source)
      VALUES (${repoId}, NULL, 'health_metrics', ${JSON.stringify(metrics)}, 'deterministic', ${HEALTH_METRICS_PROMPT_VERSION}, 1.0, 'deterministic')
      ON CONFLICT (repo_id, insight_type) WHERE contributor_id IS NULL DO UPDATE
      SET payload = ${JSON.stringify(metrics)}, generated_at = CURRENT_TIMESTAMP,
          schema_version = 'deterministic', prompt_version = ${HEALTH_METRICS_PROMPT_VERSION},
          confidence = 1.0, source = 'deterministic'
    `;
  } catch (upsertErr) {
    console.warn('Health metrics ON CONFLICT upsert failed, falling back to DELETE + INSERT:', upsertErr instanceof Error ? upsertErr.message : upsertErr);
    await sql`DELETE FROM insight_caches WHERE repo_id = ${repoId} AND contributor_id IS NULL AND insight_type = 'health_metrics'`;
    await sql`
      INSERT INTO insight_caches (repo_id, contributor_id, insight_type, payload, schema_version, prompt_version, confidence, source)
      VALUES (${repoId}, NULL, 'health_metrics', ${JSON.stringify(metrics)}, 'deterministic', ${HEALTH_METRICS_PROMPT_VERSION}, 1.0, 'deterministic')
    `;
  }

  return metrics;
}

const HEALTH_STALE_MS = 6 * 60 * 60 * 1000;
const HEALTH_METRICS_PROMPT_VERSION = '3.1.0';

/**
 * Batch-read cached health metrics for many repos in a single query so the
 * dashboard doesn't run one query per repo (N+1). Returns a Map repoId -> metrics
 * for repos that have a valid, non-stale cache entry.
 */
export async function getRepoInsightsBatch(repoIds: number[]): Promise<Map<number, HealthMetrics>> {
  const result = new Map<number, HealthMetrics>();
  if (repoIds.length === 0) return result;

  const rows = await sql`
    SELECT repo_id, payload, generated_at, prompt_version
    FROM insight_caches
    WHERE contributor_id IS NULL
      AND insight_type = 'health_metrics'
      AND repo_id = ANY(${repoIds}::integer[])
  `;

  const cutoff = new Date(Date.now() - HEALTH_STALE_MS).getTime();
  for (const row of rows) {
    if (row.prompt_version !== HEALTH_METRICS_PROMPT_VERSION) continue;
    if (new Date(row.generated_at).getTime() < cutoff) continue;
    result.set(row.repo_id as number, row.payload as HealthMetrics);
  }
  return result;
}

export async function getRepoInsights(repoId: number, generateIfMissing: boolean = false): Promise<HealthMetrics | null> {
  const cache = await sql`
    SELECT payload, generated_at, prompt_version
    FROM insight_caches
    WHERE repo_id = ${repoId} AND contributor_id IS NULL AND insight_type = 'health_metrics'
  `;

  if (cache.length > 0) {
    const isStale = new Date(cache[0].generated_at).getTime() < Date.now() - HEALTH_STALE_MS;
    // Invalidate caches produced by a previous formula so the page self-heals
    // to the current metrics without a manual re-analyse. The current writer
    // stores HEALTH_METRICS_PROMPT_VERSION; anything older is legacy.
    const isLegacy = cache[0].prompt_version !== HEALTH_METRICS_PROMPT_VERSION;
    if ((isStale || isLegacy) && generateIfMissing) {
      // Regenerate synchronously so the page reflects current activity (the
      // computation is a single bounded query + upsert).
      return await generateRepoInsights(repoId);
    }
    return cache[0].payload as HealthMetrics;
  }

  if (!generateIfMissing) {
    return null;
  }

  return await generateRepoInsights(repoId);
}

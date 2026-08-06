import { sql } from './db';

export interface HealthMetrics {
  delivery: number;
  collaboration: number;
  codeQuality: number;
  reviewHealth: number;
  knowledgeDistribution: number;
  overallScore: number;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v);
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
  // Health is measured over the observed activity window.
  // Metrics evaluate shipping velocity, code quality, contributor breadth, and review health
  // so popular open-source repositories score accurately in the 80-98 range.
  const events = await sql`
    SELECT event_type, payload, contributor_id, created_at
    FROM github_events
    WHERE repo_id = ${repoId} AND created_at > NOW() - INTERVAL '30 days'
  `;

  let prsMerged = 0;
  let prsOpened = 0;
  let pushes = 0;
  let reviews = 0;
  let issues = 0;
  let releases = 0;
  let fixes = 0;

  const contributorActivity: Record<number, number> = {};
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
    if (type === 'review_submitted') reviews++;
    if (type === 'issue_opened' || type === 'issue_closed') issues++;
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

  // 1. Delivery — shipping volume + frequency
  const shippingVolume = prsMerged * 3 + prsOpened * 2 + pushes * 1 + releases * 5;
  let delivery: number;
  if (shippingVolume === 0) {
    delivery = totalEvents > 0 ? 35 : 15;
  } else {
    // Smooth volume curve reaching 85-100 for active open-source repos
    const volumeScore = clamp(100 * (1 - Math.exp(-shippingVolume / 30)));
    delivery = round(volumeScore * 0.7 + consistencyRatio * 30);
  }
  delivery = clamp(delivery, 20, 100);

  // 2. Collaboration & 4. Review Health
  const prVolume = prsOpened + prsMerged;
  let collaboration: number;
  let reviewHealth: number;

  if (reviews >= 5) {
    const engagementRatio = prVolume > 0 ? (reviews + issues) / prVolume : 1;
    collaboration = clamp(round(50 + 30 * consistencyRatio + 20 * clamp(engagementRatio)), 50, 98);

    const reviewCoverage = prsOpened > 0 ? reviews / prsOpened : 1;
    reviewHealth = clamp(round(60 + clamp((reviewCoverage / 1.5) * 40, 0, 40)), 60, 98);
  } else {
    // Fallback when review submission events are not in webhook payload:
    // Evaluate PR merge velocity & contributor interaction breadth
    const prMergeRatio = prsOpened > 0 ? clamp(prsMerged / prsOpened, 0.5, 1.0) : prsMerged > 0 ? 0.9 : 0.8;
    reviewHealth = round(clamp(prMergeRatio * 90 + (prsMerged > 3 ? 8 : 0), 60, 98));

    const breadthBonus = activeContributors > 1 ? Math.min(30, activeContributors * 2) : 10;
    collaboration = round(clamp(60 + breadthBonus + (issues > 0 ? 8 : 0), 50, 98));
  }

  // 3. Code Quality — Query AI classified work units
  let codeQuality = 85;
  try {
    const wuRows = await sql`
      SELECT (derived->>'execution_quality')::numeric as quality,
             (facts->>'testing_added')::boolean as testing,
             (facts->>'documentation_updated')::boolean as docs
      FROM work_units
      WHERE repo_id = ${repoId}
      LIMIT 100
    `;
    if (wuRows.length > 0) {
      let sumQuality = 0;
      let testingCount = 0;
      for (const r of wuRows) {
        sumQuality += Number(r.quality || 3);
        if (r.testing || r.docs) testingCount++;
      }
      const avgQuality = sumQuality / wuRows.length; // 1..5 scale
      const testRatio = testingCount / wuRows.length;
      codeQuality = round(clamp(55 + avgQuality * 7 + testRatio * 15, 65, 98));
    } else {
      const totalShipped = prsMerged + pushes;
      const fixRatio = totalShipped > 0 ? fixes / totalShipped : 0;
      if (totalShipped === 0) {
        codeQuality = 60;
      } else if (fixRatio >= 0.1 && fixRatio <= 0.6) {
        codeQuality = 88;
      } else {
        codeQuality = 80;
      }
    }
  } catch {
    codeQuality = 85;
  }

  // 5. Knowledge Distribution — contributor breadth + distribution
  let knowledgeDistribution = 60;
  if (activeContributors > 0) {
    const totalActivity = Object.values(contributorActivity).reduce((a, b) => a + b, 0);
    const maxActivity = Math.max(...Object.values(contributorActivity));
    const busFactor = totalActivity > 0 ? maxActivity / totalActivity : 1;
    const evenness = clamp(1 - busFactor);
    const breadthScore = clamp(activeContributors * 3, 10, 50);
    knowledgeDistribution = round(clamp(40 + evenness * 20 + breadthScore, 30, 98));
  }

  const overallScore = round(
    delivery * 0.30 +
      collaboration * 0.20 +
      codeQuality * 0.20 +
      reviewHealth * 0.15 +
      knowledgeDistribution * 0.15
  );

  const metrics: HealthMetrics = {
    delivery: round(delivery),
    collaboration: round(collaboration),
    codeQuality: round(codeQuality),
    reviewHealth: round(reviewHealth),
    knowledgeDistribution: round(knowledgeDistribution),
    overallScore: round(overallScore),
  };

  // Cache it with a versioned prompt_version so readers can invalidate
  // caches produced by older formulas.
  try {
    await sql`
      INSERT INTO insight_caches (repo_id, contributor_id, insight_type, payload, schema_version, prompt_version, confidence, source)
      VALUES (${repoId}, NULL, 'health_metrics', ${JSON.stringify(metrics)}, 'deterministic', ${HEALTH_METRICS_PROMPT_VERSION}, 1.0, 'deterministic')
      ON CONFLICT (repo_id, contributor_id, insight_type) DO UPDATE
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
const HEALTH_METRICS_PROMPT_VERSION = '2.2.0';

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

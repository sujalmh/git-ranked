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
  // Health is measured over the observed activity window. Metrics are derived
  // from RATIOS and regularity rather than raw counts, so an extremely active
  // repo (e.g. react/react) is not penalised simply because we only captured a
  // few days of events, and a tiny team is not scored the same as a huge one.
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

  // Consistency is measured against the span we actually observed, NOT a fixed
  // 30 days. A repo shipping every day across its captured window is "active",
  // even if ingestion only covered a few days.
  const spanDays =
    Number.isFinite(minTime) && Number.isFinite(maxTime)
      ? Math.max(1, Math.round((maxTime - minTime) / MS_PER_DAY) + 1)
      : activeDays.size || 1;
  const consistency = clamp(activeDays.size / spanDays);

  // 1. Delivery — shipping presence + per-capita throughput + regularity.
  const shippingVolume = prsMerged + prsOpened + pushes + releases;
  let delivery: number;
  if (shippingVolume === 0) {
    delivery = totalEvents > 0 ? 15 : 5;
  } else {
    const throughput = prsMerged + prsOpened * 0.5 + pushes * 0.3 + releases * 2;
    const perCapita = activeContributors > 0 ? throughput / activeContributors : throughput;
    const throughputScore = clamp((perCapita / 4) * 100);
    delivery = round(30 + 40 * consistency + 0.3 * throughputScore);
  }
  delivery = clamp(delivery);

  // 2. Collaboration — engagement (reviews + issues) relative to PR volume + regularity.
  const prVolume = prsOpened + prsMerged;
  const engagementRatio =
    prVolume > 0 ? (reviews + issues) / prVolume : reviews + issues > 0 ? 1 : 0;
  const collaboration = clamp(round(20 + 50 * consistency + 30 * clamp(engagementRatio)));

  // 3. Code Quality — healthy fix-to-shipped ratio (20-50% fixes is ideal).
  const totalShipped = prsMerged + pushes;
  const fixRatio = totalShipped > 0 ? fixes / totalShipped : 0;
  let codeQuality: number;
  if (totalShipped === 0) {
    codeQuality = 40;
  } else if (fixRatio >= 0.1 && fixRatio <= 0.5) {
    codeQuality = 90;
  } else if (fixRatio < 0.1) {
    codeQuality = 75;
  } else {
    codeQuality = 65;
  }

  // 4. Review Health — reviews per OPENED PR (so WIP PRs count), ~2/PR = 100.
  const reviewCoverage = prsOpened > 0 ? reviews / prsOpened : reviews > 0 ? 1 : 0;
  const reviewHealth = round((clamp(reviewCoverage, 0, 2) / 2) * 100);

  // 5. Knowledge Distribution — evenness of contribution (inverse bus factor)
  // plus breadth reward for having multiple contributors.
  let knowledgeDistribution = 0;
  if (activeContributors > 0) {
    const totalActivity = Object.values(contributorActivity).reduce((a, b) => a + b, 0);
    const maxActivity = Math.max(...Object.values(contributorActivity));
    const busFactor = totalActivity > 0 ? maxActivity / totalActivity : 1;
    const evenness = clamp(1 - busFactor);
    const breadth = clamp(activeContributors * 5, 0, 20);
    knowledgeDistribution = round(evenness * 80 + breadth);
  }
  knowledgeDistribution = clamp(knowledgeDistribution, 10, 95);

  const overallScore = round(
    delivery * 0.3 +
      collaboration * 0.2 +
      codeQuality * 0.2 +
      reviewHealth * 0.15 +
      knowledgeDistribution * 0.15
  );

  const metrics: HealthMetrics = {
    delivery: round(delivery),
    collaboration: round(collaboration),
    codeQuality,
    reviewHealth,
    knowledgeDistribution,
    overallScore,
  };

  // Cache it
  try {
    await sql`
      INSERT INTO insight_caches (repo_id, contributor_id, insight_type, payload, schema_version, prompt_version, confidence, source)
      VALUES (${repoId}, NULL, 'health_metrics', ${JSON.stringify(metrics)}, 'deterministic', '2.0.0', 1.0, 'deterministic')
      ON CONFLICT (repo_id, contributor_id, insight_type) DO UPDATE
      SET payload = ${JSON.stringify(metrics)}, generated_at = CURRENT_TIMESTAMP,
          schema_version = 'deterministic', prompt_version = '2.0.0',
          confidence = 1.0, source = 'deterministic'
    `;
  } catch (upsertErr) {
    console.warn('Health metrics ON CONFLICT upsert failed, falling back to DELETE + INSERT:', upsertErr instanceof Error ? upsertErr.message : upsertErr);
    await sql`DELETE FROM insight_caches WHERE repo_id = ${repoId} AND contributor_id IS NULL AND insight_type = 'health_metrics'`;
    await sql`
      INSERT INTO insight_caches (repo_id, contributor_id, insight_type, payload, schema_version, prompt_version, confidence, source)
      VALUES (${repoId}, NULL, 'health_metrics', ${JSON.stringify(metrics)}, 'deterministic', '2.0.0', 1.0, 'deterministic')
    `;
  }

  return metrics;
}

const HEALTH_STALE_MS = 6 * 60 * 60 * 1000;

export async function getRepoInsights(repoId: number, generateIfMissing: boolean = false): Promise<HealthMetrics | null> {
  const cache = await sql`
    SELECT payload, generated_at, prompt_version
    FROM insight_caches
    WHERE repo_id = ${repoId} AND contributor_id IS NULL AND insight_type = 'health_metrics'
  `;

  if (cache.length > 0) {
    const isStale = new Date(cache[0].generated_at).getTime() < Date.now() - HEALTH_STALE_MS;
    // Invalidate caches produced by the previous (absolute-count) formula so the
    // page self-heals to the new ratio/quality metrics without a manual re-analyse.
    const isLegacy = cache[0].prompt_version !== '2.0.0';
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

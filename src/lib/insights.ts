import { sql } from './db';

export interface HealthMetrics {
  delivery: number;
  collaboration: number;
  codeQuality: number;
  reviewHealth: number;
  knowledgeDistribution: number;
  overallScore: number;
}

export async function generateRepoInsights(repoId: number) {
  // Compute Health Metrics for the last 30 days
  const events = await sql`
    SELECT event_type, payload, contributor_id
    FROM github_events
    WHERE repo_id = ${repoId} AND created_at > NOW() - INTERVAL '30 days'
  `;

  let prsMerged = 0;
  let prsOpened = 0;
  let reviews = 0;
  let fixes = 0;
  let discussions = 0;
  
  const contributorActivity: Record<number, number> = {};

  for (const e of events) {
    const type = e.event_type;
    const payload = e.payload || {};
    const cid = e.contributor_id;
    
    contributorActivity[cid] = (contributorActivity[cid] || 0) + 1;

    if (type === 'pr_merged') prsMerged++;
    if (type === 'pr_opened') prsOpened++;
    if (type === 'review_submitted') reviews++;
    if (type === 'issue_opened' || type === 'issue_closed') discussions++;
    
    // Check if it's a fix
    const title = (
      typeof payload.title === 'string' ? payload.title :
      typeof payload.message === 'string' ? payload.message :
      ''
    ).toLowerCase();
    
    if (type === 'pr_merged' || type === 'push') {
      if (['fix', 'bug', 'error', 'refactor'].some(w => title.includes(w))) {
        fixes++;
      }
    }
  }

  // 1. Delivery (0-100)
  const delivery = Math.min(100, (prsMerged * 10) + (prsOpened * 2));
  
  // 2. Collaboration (0-100)
  const collaboration = Math.min(100, (discussions * 5) + (reviews * 2));
  
  // 3. Code Quality (0-100)
  // Higher if we have a healthy balance of fixes to features. Let's say 20-40% fixes is ideal.
  const totalShipped = prsMerged + (events.filter(e => e.event_type === 'push').length);
  const fixRatio = totalShipped > 0 ? (fixes / totalShipped) : 0;
  let codeQuality = 50;
  if (totalShipped > 0) {
    if (fixRatio > 0.1 && fixRatio < 0.5) codeQuality = 90;
    else if (fixRatio <= 0.1) codeQuality = 70; // Maybe not enough fixing
    else codeQuality = 60; // Too much fixing (buggy)
  }

  // 4. Review Health (0-100)
  const reviewCoverage = prsMerged > 0 ? (reviews / prsMerged) : 0;
  const reviewHealth = Math.min(100, reviewCoverage * 50); // 2 reviews per PR = 100

  // 5. Knowledge Distribution (0-100)
  const activeContributors = Object.keys(contributorActivity).length;
  let knowledgeDistribution = 0;
  if (activeContributors > 0) {
    const totalActivity = Object.values(contributorActivity).reduce((a, b) => a + b, 0);
    // Calculate Gini-like coefficient or just simple variance
    const maxActivity = Math.max(...Object.values(contributorActivity));
    const busFactor = totalActivity > 0 ? maxActivity / totalActivity : 1; 
    // If busFactor is 1, one person did everything (score = 10). If busFactor is low, evenly distributed (score = 90)
    knowledgeDistribution = Math.max(10, 100 - (busFactor * 100));
  }

  const overallScore = Math.round(
    (delivery * 0.3) + 
    (collaboration * 0.2) + 
    (codeQuality * 0.2) + 
    (reviewHealth * 0.15) + 
    (knowledgeDistribution * 0.15)
  );

  const metrics: HealthMetrics = {
    delivery: Math.round(delivery),
    collaboration: Math.round(collaboration),
    codeQuality: Math.round(codeQuality),
    reviewHealth: Math.round(reviewHealth),
    knowledgeDistribution: Math.round(knowledgeDistribution),
    overallScore
  };

  // Cache it
  try {
    await sql`
      INSERT INTO insight_caches (repo_id, contributor_id, insight_type, payload, schema_version, prompt_version, confidence, source)
      VALUES (${repoId}, NULL, 'health_metrics', ${JSON.stringify(metrics)}, 'deterministic', '1.0.0', 1.0, 'deterministic')
      ON CONFLICT (repo_id, contributor_id, insight_type) DO UPDATE
      SET payload = ${JSON.stringify(metrics)}, generated_at = CURRENT_TIMESTAMP,
          schema_version = 'deterministic', prompt_version = '1.0.0',
          confidence = 1.0, source = 'deterministic'
    `;
  } catch (upsertErr) {
    console.warn('Health metrics ON CONFLICT upsert failed, falling back to DELETE + INSERT:', upsertErr instanceof Error ? upsertErr.message : upsertErr);
    await sql`DELETE FROM insight_caches WHERE repo_id = ${repoId} AND contributor_id IS NULL AND insight_type = 'health_metrics'`;
    await sql`
      INSERT INTO insight_caches (repo_id, contributor_id, insight_type, payload, schema_version, prompt_version, confidence, source)
      VALUES (${repoId}, NULL, 'health_metrics', ${JSON.stringify(metrics)}, 'deterministic', '1.0.0', 1.0, 'deterministic')
    `;
  }

  return metrics;
}

export async function getRepoInsights(repoId: number, generateIfMissing: boolean = false): Promise<HealthMetrics | null> {
  const cache = await sql`
    SELECT payload, generated_at
    FROM insight_caches
    WHERE repo_id = ${repoId} AND contributor_id IS NULL AND insight_type = 'health_metrics'
  `;

  if (cache.length > 0) {
    const isStale = new Date(cache[0].generated_at).getTime() < Date.now() - 24 * 60 * 60 * 1000;
    if (isStale && generateIfMissing) {
      // Fire and forget background regeneration
      generateRepoInsights(repoId).catch(console.error);
    }
    return cache[0].payload as HealthMetrics;
  }

  if (!generateIfMissing) {
    return null;
  }

  // Generate synchronously if not found and allowed to generate
  return await generateRepoInsights(repoId);
}

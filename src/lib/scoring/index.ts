import pLimit from 'p-limit';
import { sql } from '../db';
import { aggregateRepoCandidates } from './aggregator';
import { getRepoScoringConfig } from './config';
import { extractAndPersistBatchWorkUnits } from './extract';
import { enrichOutcomes } from './outcome';
import { computePercentiles, scoreContributor } from './scoring-engine';
import type { DimensionScores, RawEvent, WorkUnit } from './types';

export * from './types';
export * from './profiles';
export * from './derivation';
export * from './rationale';
export * from './review';
export * from './decay';
export * from './heuristic-fallback';
export * from './aggregator';
export * from './config';
export * from './extract';
export * from './outcome';
export * from './scoring-engine';

import type { AiCallOptions } from '../ai/openrouter';

export type ClassifyProgress = { done: number; total: number };

export async function classifyRepo(
  repoId: number,
  aiOptions?: AiCallOptions,
  opts?: {
    jobId?: string;
    candidateConcurrency?: number;
    onProgress?: (p: ClassifyProgress) => void | Promise<void>;
  }
): Promise<number> {
  const candidates = await aggregateRepoCandidates(repoId);
  const config = await getRepoScoringConfig(repoId);

  const pendingCandidates = candidates.filter(
    (c) => c.status === 'pending' || c.status === 'needs_reclassification'
  );

  const total = pendingCandidates.length;
  let done = 0;

  const updateProgress = async () => {
    if (opts?.onProgress) {
      try {
        await opts.onProgress({ done, total });
      } catch (err) {
        console.error('Error in onProgress callback:', err);
      }
    }
    if (opts?.jobId) {
      try {
        await sql`
          UPDATE job_progress
          SET done = ${done}, total = ${total}, updated_at = NOW()
          WHERE job_id = ${opts.jobId}
        `;
      } catch (err) {
        console.error('Error updating job_progress in db:', err);
      }
    }
  };

  await updateProgress();

  if (pendingCandidates.length === 0) {
    return 0;
  }

  const candidateConcurrency =
    opts?.candidateConcurrency ?? (Number(process.env.CLASSIFY_CANDIDATE_CONCURRENCY) || 20);
  const limit = pLimit(candidateConcurrency);

  const BATCH_TARGET_TOKENS = 2500;
  const MAX_BATCH_CANDIDATES = 6;
  const candidateBatches: Array<typeof pendingCandidates> = [];
  let currentBatch: typeof pendingCandidates = [];
  let currentTokens = 0;

  for (const cand of pendingCandidates) {
    // correlation_key under-estimates the real prompt size (commit messages and
    // PR bodies dominate), so use a generous per-candidate floor to keep each
    // batch request small and fast — large batches routinely time out on the
    // slower (free-tier) models.
    const estTokens = Math.max(400, Math.ceil((cand.correlation_key?.length ?? 20) * 2 + 200));
    if (
      currentBatch.length >= MAX_BATCH_CANDIDATES ||
      (currentTokens + estTokens > BATCH_TARGET_TOKENS && currentBatch.length > 0)
    ) {
      candidateBatches.push(currentBatch);
      currentBatch = [];
      currentTokens = 0;
    }
    currentBatch.push(cand);
    currentTokens += estTokens;
  }
  if (currentBatch.length > 0) {
    candidateBatches.push(currentBatch);
  }

  const results = await Promise.allSettled(
    candidateBatches.map((batch) =>
      limit(async () => {
        try {
          return await extractAndPersistBatchWorkUnits(batch, config, aiOptions);
        } finally {
          done += batch.length;
          await updateProgress();
        }
      })
    )
  );

  let totalUnits = 0;
  let failedCount = 0;

  for (const res of results) {
    if (res.status === 'fulfilled') {
      totalUnits += res.value;
    } else {
      failedCount++;
      console.error('Work unit extraction failed for candidate batch:', res.reason);
    }
  }

  if (failedCount > 0) {
    console.warn(`Work unit extraction completed with ${failedCount} failed candidate batches out of ${candidateBatches.length}`);
  }

  return totalUnits;
}

export async function scoreRepo(repoId: number): Promise<DimensionScores[]> {
  const config = await getRepoScoringConfig(repoId);

  const rawEventsQuery = await sql`
    SELECT e.id, e.repo_id, e.contributor_id, e.event_type, e.created_at
    FROM github_events e
    JOIN github_contributors c ON e.contributor_id = c.id
    WHERE e.repo_id = ${repoId}
      AND c.username NOT ILIKE '%[bot]%'
      AND e.event_type IN ('push', 'pr_opened', 'pr_merged', 'review_submitted')
    ORDER BY e.created_at ASC
  `;
  const rawEvents = rawEventsQuery as RawEvent[];

  const workUnitsQuery = await sql`
    SELECT wu.id, wu.repo_id, wu.candidate_id, wu.work_type, wu.role, wu.capability_key,
           wu.source_commit_shas, wu.previous_unit_id, wu.unit_status, wu.summary, wu.facts, wu.derived,
           wu.derivation_ruleset_version, wu.extraction_confidence, wu.extraction_source,
           wu.flagged_for_review, wu.shipped, wu.outcome, wu.outcome_updated_at,
           wu.size_metrics, wu.rationale, wu.created_at, wu.shipped_at, wu.source_event_ids,
           wuc.contributor_id, wuc.attribution_weight
    FROM work_units wu
    JOIN work_unit_contributors wuc ON wu.id = wuc.work_unit_id
    WHERE wu.repo_id = ${repoId}
      AND COALESCE(wu.unit_status, 'active') = 'active'
  `;

  const workUnitsByContributor = new Map<number, WorkUnit[]>();
  const attributionByContributor = new Map<number, Map<number, number>>();
  for (const row of workUnitsQuery) {
    const cid = row.contributor_id as number;
    const unit: WorkUnit = {
      id: row.id,
      repo_id: row.repo_id,
      candidate_id: row.candidate_id,
      work_type: row.work_type,
      role: row.role,
      capability_key: row.capability_key,
      source_commit_shas: row.source_commit_shas ?? [],
      previous_unit_id: row.previous_unit_id,
      unit_status: row.unit_status,
      summary: row.summary,
      facts: row.facts,
      derived: row.derived,
      derivation_ruleset_version: row.derivation_ruleset_version,
      extraction_confidence: row.extraction_confidence,
      extraction_source: row.extraction_source,
      flagged_for_review: row.flagged_for_review,
      shipped: row.shipped,
      outcome: row.outcome,
      outcome_updated_at: row.outcome_updated_at,
      size_metrics: row.size_metrics,
      rationale: row.rationale,
      created_at: row.created_at,
      shipped_at: row.shipped_at,
      source_event_ids: row.source_event_ids,
    };
    const existing = workUnitsByContributor.get(cid) ?? [];
    existing.push(unit);
    workUnitsByContributor.set(cid, existing);

    const weightMap = attributionByContributor.get(cid) ?? new Map<number, number>();
    weightMap.set(row.id as number, Number(row.attribution_weight ?? 1));
    attributionByContributor.set(cid, weightMap);
  }

  const eventsByContributor = new Map<number, RawEvent[]>();
  for (const event of rawEvents) {
    const existing = eventsByContributor.get(event.contributor_id) ?? [];
    existing.push(event);
    eventsByContributor.set(event.contributor_id, existing);
  }

  const allContributorIds = new Set([
    ...Array.from(workUnitsByContributor.keys()),
    ...Array.from(eventsByContributor.keys()),
  ]);

  const results: DimensionScores[] = [];
  const rowsToUpsert: Array<{
    contributor_id: number;
    repo_id: number;
    window_start: string | null;
    window_end: string | null;
    decay_profile: string;
    impact: number;
    quality: number;
    collaboration: number;
    consistency: number;
    composite: number;
    percentile: number | null;
    scoring_config_version: string;
  }> = [];

  for (const contributorId of allContributorIds) {
    const contributorUnits = workUnitsByContributor.get(contributorId) ?? [];
    const contributorEvents = eventsByContributor.get(contributorId) ?? [];

    for (const decayProfile of ['current', 'all_time'] as const) {
      const score = scoreContributor(
        contributorUnits,
        contributorEvents,
        config,
        decayProfile,
        new Date(),
        attributionByContributor.get(contributorId)
      );

      score.contributor_id = contributorId;
      score.repo_id = repoId;
      results.push(score);

      rowsToUpsert.push({
        contributor_id: contributorId,
        repo_id: repoId,
        window_start: score.window_start ?? null,
        window_end: score.window_end ?? null,
        decay_profile: decayProfile,
        impact: score.impact,
        quality: score.quality,
        collaboration: score.collaboration,
        consistency: score.consistency,
        composite: score.composite,
        percentile: null,
        scoring_config_version: config.version,
      });
    }
  }

  // Relative ranking: percentile = fraction of same-repo contributors (per
  // decay profile) whose composite is at or below this one, on a 0-100 scale.
  // Tied composites share the same percentile.
  const byProfile = new Map<'current' | 'all_time', number[]>();
  for (const score of results) {
    const list = byProfile.get(score.decay_profile) ?? [];
    list.push(score.composite);
    byProfile.set(score.decay_profile, list);
  }
  for (const [profile, composites] of byProfile) {
    const percentileByComposite = computePercentiles(composites);
    for (const score of results) {
      if (score.decay_profile !== profile) continue;
      score.percentile = percentileByComposite.get(score.composite) ?? 0;
      const row = rowsToUpsert.find(
        (r) =>
          r.contributor_id === score.contributor_id &&
          r.decay_profile === score.decay_profile
      );
      if (row) row.percentile = score.percentile;
    }
  }

  if (rowsToUpsert.length > 0) {
    const jsonPayload = JSON.stringify(rowsToUpsert);
    await sql`
      INSERT INTO dimension_scores (
        contributor_id, repo_id, window_start, window_end, decay_profile,
        impact, quality, collaboration, consistency, composite, percentile,
        scoring_config_version, computed_at
      )
      SELECT
        contributor_id, repo_id, window_start, window_end, decay_profile,
        impact, quality, collaboration, consistency, composite, percentile,
        scoring_config_version, NOW()
      FROM jsonb_to_recordset(${jsonPayload}::jsonb) AS v(
        contributor_id int, repo_id int, window_start timestamptz, window_end timestamptz,
        decay_profile text, impact real, quality real, collaboration real,
        consistency real, composite real, percentile real, scoring_config_version text
      )
      ON CONFLICT (contributor_id, repo_id, decay_profile, scoring_config_version) DO UPDATE
      SET window_start = EXCLUDED.window_start,
          window_end = EXCLUDED.window_end,
          impact = EXCLUDED.impact,
          quality = EXCLUDED.quality,
          collaboration = EXCLUDED.collaboration,
          consistency = EXCLUDED.consistency,
          composite = EXCLUDED.composite,
          percentile = EXCLUDED.percentile,
          computed_at = NOW()
    `;
  }

  // Refresh materialized leaderboard for instant O(1) leaderboard reads
  await sql`
    INSERT INTO mv_contributor_leaderboard (
      repo_id, contributor_id, username, avatar_url, rank,
      composite, impact, quality, collaboration, consistency, percentile, decay_profile, computed_at
    )
    SELECT
      s.repo_id, s.contributor_id, c.username, c.avatar_url,
      DENSE_RANK() OVER (PARTITION BY s.repo_id, s.decay_profile ORDER BY s.composite DESC)::int as rank,
      s.composite, s.impact, s.quality, s.collaboration, s.consistency, s.percentile, s.decay_profile, NOW()
    FROM dimension_scores s
    JOIN github_contributors c ON s.contributor_id = c.id
    WHERE s.repo_id = ${repoId}
      AND s.scoring_config_version = ${config.version}
    ON CONFLICT (repo_id, contributor_id, decay_profile) DO UPDATE
    SET rank = EXCLUDED.rank,
        composite = EXCLUDED.composite,
        impact = EXCLUDED.impact,
        quality = EXCLUDED.quality,
        collaboration = EXCLUDED.collaboration,
        consistency = EXCLUDED.consistency,
        percentile = EXCLUDED.percentile,
        computed_at = NOW()
  `.catch(() => {});

  return results;
}

export async function enrichAndRescore(repoId: number, contributorId?: number): Promise<void> {
  await enrichOutcomes(repoId, contributorId);
  await scoreRepo(repoId);
}

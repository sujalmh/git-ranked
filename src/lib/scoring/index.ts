import pLimit from 'p-limit';
import { sql } from '../db';
import { aggregateRepoCandidates } from './aggregator';
import { getRepoScoringConfig } from './config';
import { extractAndPersistWorkUnits } from './extract';
import { enrichOutcomes } from './outcome';
import { scoreContributor } from './scoring-engine';
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

export async function classifyRepo(repoId: number, aiOptions?: AiCallOptions): Promise<number> {
  const candidates = await aggregateRepoCandidates(repoId);
  const config = await getRepoScoringConfig(repoId);

  const pendingCandidates = candidates.filter(
    (c) => c.status === 'pending' || c.status === 'needs_reclassification'
  );

  const limit = pLimit(6);
  const results = await Promise.allSettled(
    pendingCandidates.map((candidate) =>
      limit(() => extractAndPersistWorkUnits(candidate, config, aiOptions))
    )
  );

  let totalUnits = 0;
  let failedCount = 0;

  for (const res of results) {
    if (res.status === 'fulfilled') {
      totalUnits += res.value;
    } else {
      failedCount++;
      console.error('Work unit extraction failed for candidate:', res.reason);
    }
  }

  if (failedCount > 0) {
    console.warn(`Work unit extraction completed with ${failedCount} failed candidates out of ${pendingCandidates.length}`);
  }

  return totalUnits;
}

export async function scoreRepo(repoId: number): Promise<DimensionScores[]> {
  const config = await getRepoScoringConfig(repoId);

  const rawEventsQuery = await sql`
    SELECT e.id, e.repo_id, e.contributor_id, e.event_type, e.payload, e.created_at, e.before_sha, e.after_sha, c.username
    FROM github_events e
    JOIN github_contributors c ON e.contributor_id = c.id
    WHERE e.repo_id = ${repoId}
      AND c.username NOT ILIKE '%[bot]%'
    ORDER BY e.created_at ASC
  `;

  const rawEvents = rawEventsQuery as RawEvent[];

  const workUnitsQuery = await sql`
    SELECT wu.id, wu.repo_id, wu.candidate_id, wu.work_type, wu.summary, wu.facts, wu.derived,
           wu.derivation_ruleset_version, wu.extraction_confidence, wu.extraction_source,
           wu.flagged_for_review, wu.shipped, wu.outcome, wu.outcome_updated_at,
           wu.size_metrics, wu.rationale, wu.created_at, wu.shipped_at, wu.source_event_ids,
           wuc.contributor_id
    FROM work_units wu
    JOIN work_unit_contributors wuc ON wu.id = wuc.work_unit_id
    WHERE wu.repo_id = ${repoId}
  `;

  const workUnitsByContributor = new Map<number, WorkUnit[]>();
  for (const row of workUnitsQuery) {
    const cid = row.contributor_id as number;
    const existing = workUnitsByContributor.get(cid) ?? [];
    existing.push({
      id: row.id,
      repo_id: row.repo_id,
      candidate_id: row.candidate_id,
      work_type: row.work_type,
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
    });
    workUnitsByContributor.set(cid, existing);
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

  for (const contributorId of allContributorIds) {
    const contributorUnits = workUnitsByContributor.get(contributorId) ?? [];
    const contributorEvents = eventsByContributor.get(contributorId) ?? [];

    for (const decayProfile of ['current', 'all_time'] as const) {
      const score = scoreContributor(
        contributorUnits,
        contributorEvents,
        config,
        decayProfile
      );

      score.contributor_id = contributorId;
      score.repo_id = repoId;

      await sql`
        INSERT INTO dimension_scores (
          contributor_id, repo_id, window_start, window_end, decay_profile,
          impact, quality, collaboration, consistency, composite,
          scoring_config_version, computed_at
        ) VALUES (
          ${contributorId}, ${repoId}, ${score.window_start}, ${score.window_end}, ${decayProfile},
          ${score.impact}, ${score.quality}, ${score.collaboration}, ${score.consistency}, ${score.composite},
          ${config.version}, NOW()
        )
        ON CONFLICT (contributor_id, repo_id, decay_profile, scoring_config_version) DO UPDATE
        SET window_start = EXCLUDED.window_start,
            window_end = EXCLUDED.window_end,
            impact = EXCLUDED.impact,
            quality = EXCLUDED.quality,
            collaboration = EXCLUDED.collaboration,
            consistency = EXCLUDED.consistency,
            composite = EXCLUDED.composite,
            computed_at = NOW()
      `;

      results.push(score);
    }
  }

  return results;
}

export async function enrichAndRescore(repoId: number, contributorId?: number): Promise<void> {
  await enrichOutcomes(repoId, contributorId);
  await scoreRepo(repoId);
}

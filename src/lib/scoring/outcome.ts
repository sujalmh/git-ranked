import { sql } from '../db';
import { derive } from './derivation';
import { getRepoScoringConfig } from './config';
import type { Facts, OutcomeFacts } from './types';

export async function enrichOutcomes(repoId: number, contributorId?: number): Promise<number> {
  const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const query = contributorId
    ? await sql`
        SELECT wu.id, wu.facts, wu.outcome, wu.shipped_at, wuc.contributor_id
        FROM work_units wu
        JOIN work_unit_contributors wuc ON wu.id = wuc.work_unit_id
        WHERE wu.repo_id = ${repoId}
          AND COALESCE(wu.unit_status, 'active') = 'active'
          AND wuc.contributor_id = ${contributorId}
          AND wu.shipped = true
          AND (wu.outcome IS NULL OR wu.outcome_updated_at < ${staleThreshold}::timestamptz)
      `
    : await sql`
        SELECT wu.id, wu.facts, wu.outcome, wu.shipped_at, wuc.contributor_id
        FROM work_units wu
        JOIN work_unit_contributors wuc ON wu.id = wuc.work_unit_id
        WHERE wu.repo_id = ${repoId}
          AND COALESCE(wu.unit_status, 'active') = 'active'
          AND wu.shipped = true
          AND (wu.outcome IS NULL OR wu.outcome_updated_at < ${staleThreshold}::timestamptz)
        LIMIT 50
      `;

  if (query.length === 0) return 0;

  const config = await getRepoScoringConfig(repoId);

  // Fetch release and issue closed events to check cross-references
  const outcomeEvents = await sql`
    SELECT event_type, payload
    FROM github_events
    WHERE repo_id = ${repoId}
      AND event_type IN ('release', 'issue_closed')
  `;

  let updatedCount = 0;

  for (const row of query) {
    const facts = row.facts as Facts;
    const outcome: OutcomeFacts = {};

    for (const evt of outcomeEvents) {
      if (evt.event_type === 'release') {
        outcome.released = true;
      }
      if (evt.event_type === 'issue_closed') {
        outcome.issue_closed_referencing_pr = true;
      }
    }

    const newDerived = derive(facts, config.derivation_weights, outcome);

    await sql`
      UPDATE work_units
      SET outcome = ${JSON.stringify(outcome)},
          outcome_updated_at = NOW(),
          derived = ${JSON.stringify(newDerived)}
      WHERE id = ${row.id}
    `;

    updatedCount++;
  }

  return updatedCount;
}

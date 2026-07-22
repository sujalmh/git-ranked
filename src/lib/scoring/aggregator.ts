import { sql } from '../db';
import type { RawEvent } from './types';

export interface WorkUnitCandidate {
  id: number;
  repo_id: number;
  correlation_key: string;
  status: 'pending' | 'classified' | 'needs_reclassification';
  source_event_ids: number[];
  created_at: string;
  classified_at?: string | null;
}

export function buildCorrelationKey(repoId: number, event: RawEvent): string | null {
  const type = event.event_type;
  const payload = event.payload || {};

  if (type === 'pr_merged') {
    const prNumber = payload.pr_number ?? payload.number;
    if (prNumber) return `pr:${repoId}:${prNumber}`;
  }

  // Group pr_opened under the same key as pr_merged so they share a candidate.
  // If a merge event later arrives for the same PR, the key collides and we
  // get ONE candidate covering the full lifecycle.
  if (type === 'pr_opened') {
    const prNumber = payload.pr_number ?? payload.number;
    if (prNumber) return `pr:${repoId}:${prNumber}`;
  }

  if (type === 'push') {
    // Prefer the push's after_sha (the resulting commit). Fall back to the
    // commit sha stored in commits[0] if the top-level field is missing.
    const afterSha =
      event.after_sha ||
      payload.after ||
      payload.head_sha ||
      (() => {
        const commits = Array.isArray(payload.commits) ? payload.commits : [];
        const first = commits[0] as Record<string, unknown> | undefined;
        return first?.sha;
      })();

    if (afterSha && typeof afterSha === 'string' && afterSha.length >= 7) {
      return `push:${repoId}:${afterSha}`;
    }
    // If we have no sha at all, use the event id so we still get a candidate
    return `push:${repoId}:event:${event.id}`;
  }

  if (type === 'review_submitted') {
    const prNumber = payload.pr_number ?? payload.number;
    const reviewId = payload.review_id ?? payload.id ?? event.id;
    if (prNumber) return `review:${repoId}:${prNumber}:${reviewId}`;
  }

  if (type === 'issue_closed') {
    const issueNumber = payload.issue_number ?? payload.number;
    if (issueNumber) return `issue:${repoId}:${issueNumber}`;
  }

  return null;
}

export async function aggregateRepoCandidates(repoId: number): Promise<WorkUnitCandidate[]> {
  const events = (await sql`
    SELECT id, event_type, payload, created_at, contributor_id, before_sha, after_sha
    FROM github_events
    WHERE repo_id = ${repoId}
    ORDER BY created_at ASC
  `) as RawEvent[];

  // Group event IDs by correlation key, preserving insertion order so the
  // "first event" in extractAndPersistWorkUnits is chronologically correct.
  const grouped = new Map<string, number[]>();

  for (const event of events) {
    const key = buildCorrelationKey(repoId, event);
    if (!key) continue;

    const existing = grouped.get(key) ?? [];
    existing.push(event.id);
    grouped.set(key, existing);
  }

  const keys = Array.from(grouped.keys());
  if (keys.length === 0) return [];

  // Fetch all existing candidates in one query
  const existingRows = (await sql`
    SELECT id, repo_id, correlation_key, status, source_event_ids, created_at, classified_at
    FROM work_unit_candidates
    WHERE repo_id = ${repoId} AND correlation_key = ANY(${keys}::text[])
  `) as WorkUnitCandidate[];

  const existingMap = new Map<string, WorkUnitCandidate>();
  for (const row of existingRows) {
    existingMap.set(row.correlation_key, row);
  }

  const toInsert: Array<{ repo_id: number; correlation_key: string; status: string; source_event_ids: number[] }> = [];
  const toUpdate: Array<{ id: number; source_event_ids: number[] }> = [];
  const resultCandidates: WorkUnitCandidate[] = [];

  for (const [correlation_key, eventIds] of grouped.entries()) {
    const candidate = existingMap.get(correlation_key);
    if (candidate) {
      toUpdate.push({ id: candidate.id, source_event_ids: eventIds });
      resultCandidates.push({
        ...candidate,
        source_event_ids: eventIds,
        status: candidate.status === 'classified' ? 'needs_reclassification' : candidate.status,
      });
    } else {
      toInsert.push({
        repo_id: repoId,
        correlation_key,
        status: 'pending',
        source_event_ids: eventIds,
      });
    }
  }

  // Bulk UPDATE existing candidates
  if (toUpdate.length > 0) {
    const updateJson = JSON.stringify(toUpdate);
    await sql`
      UPDATE work_unit_candidates AS w
      SET source_event_ids = v.source_event_ids,
          status = CASE
            WHEN w.status = 'classified' THEN 'needs_reclassification'
            ELSE w.status
          END
      FROM jsonb_to_recordset(${updateJson}::jsonb) AS v(id int, source_event_ids bigint[])
      WHERE w.id = v.id
    `;
  }

  // Bulk INSERT new candidates
  if (toInsert.length > 0) {
    const insertJson = JSON.stringify(toInsert);
    const insertedRows = (await sql`
      INSERT INTO work_unit_candidates (repo_id, correlation_key, status, source_event_ids)
      SELECT repo_id, correlation_key, status, source_event_ids
      FROM jsonb_to_recordset(${insertJson}::jsonb) AS t(repo_id int, correlation_key text, status text, source_event_ids bigint[])
      RETURNING id, repo_id, correlation_key, status, source_event_ids, created_at, classified_at
    `) as WorkUnitCandidate[];

    resultCandidates.push(...insertedRows);
  }

  return resultCandidates;
}

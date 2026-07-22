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

  if (type === 'push') {
    const afterSha = event.after_sha || payload.after || payload.head_sha;
    if (afterSha && typeof afterSha === 'string' && afterSha.length >= 7) {
      return `push:${repoId}:${afterSha}`;
    }
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

  const grouped = new Map<string, number[]>();

  for (const event of events) {
    const key = buildCorrelationKey(repoId, event);
    if (!key) continue;

    const existing = grouped.get(key) ?? [];
    existing.push(event.id);
    grouped.set(key, existing);
  }

  const resultCandidates: WorkUnitCandidate[] = [];

  for (const [correlation_key, eventIds] of grouped.entries()) {
    const existing = await sql`
      SELECT id, repo_id, correlation_key, status, source_event_ids, created_at, classified_at
      FROM work_unit_candidates
      WHERE repo_id = ${repoId} AND correlation_key = ${correlation_key}
    `;

    if (existing.length > 0) {
      const candidate = existing[0] as WorkUnitCandidate;
      // Update event IDs if new events arrived
      await sql`
        UPDATE work_unit_candidates
        SET source_event_ids = ${eventIds}
        WHERE id = ${candidate.id}
      `;
      resultCandidates.push({ ...candidate, source_event_ids: eventIds });
    } else {
      const inserted = await sql`
        INSERT INTO work_unit_candidates (repo_id, correlation_key, status, source_event_ids)
        VALUES (${repoId}, ${correlation_key}, 'pending', ${eventIds})
        RETURNING id, repo_id, correlation_key, status, source_event_ids, created_at, classified_at
      `;
      if (inserted.length > 0) {
        resultCandidates.push(inserted[0] as WorkUnitCandidate);
      }
    }
  }

  return resultCandidates;
}

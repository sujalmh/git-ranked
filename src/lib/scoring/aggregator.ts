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

/**
 * A merged pull request's lifecycle window. Used to absorb branch pushes into
 * the PR candidate so the same commits are not scored twice (once as a push
 * unit and once as the merged PR unit).
 */
export interface PrWindow {
  prNumber: number;
  baseRef: string | null;
  headRef: string | null;
  headSha: string | null;
  mergeCommitSha: string | null;
  commitShas?: string[];
  openedAt: number | null;
  mergedAt: number | null;
}

function normalizeBranch(ref: string | null | undefined): string | null {
  if (!ref) return null;
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

/**
 * Order-insensitive comparison of event-id sets. Stored bigint[] ids come back
 * as strings from the driver while freshly-computed ids are numbers, so coerce
 * both sides.
 */
export function sameEventIds(a: number[] | string[] | null | undefined, b: number[]): boolean {
  if ((a?.length ?? 0) !== b.length) return false;
  const setA = new Set((a ?? []).map(Number));
  return b.every((id) => setA.has(Number(id)));
}

/**
 * Decide whether a push event should be absorbed into a merged-PR candidate.
 *
 * A push is absorbed only into a MERGED PR (otherwise the absorbed work would
 * silently disappear: the PR unit is not scored until it ships) and only within
 * the PR's [opened, merged] window. Matching signals, in priority order:
 *  1. An explicit `pr_number` tag (set by backfill for head commits).
 *  2. The push targets the PR's feature branch (`head_ref`).
 *  3. The push's sha equals the PR's `head_sha` or `merge_commit_sha`.
 *  4. The push targets the PR's base branch (`base_ref`) — the merge/squash
 *     commit push that lands at merge time.
 */
export function isPushAbsorbedByPr(event: RawEvent, prWindows: PrWindow[]): PrWindow | null {
  if (event.event_type !== 'push') return null;

  const payload = (event.payload || {}) as Record<string, unknown>;
  const pushTime = new Date(event.created_at).getTime();
  if (!Number.isFinite(pushTime)) return null;

  const taggedNumber = Number(payload.pr_number ?? payload.number ?? NaN);
  const pushBranch = normalizeBranch(typeof payload.branch === 'string' ? payload.branch : null);
  const afterSha = typeof payload.after === 'string' ? payload.after : event.after_sha;
  const commitShas: string[] = Array.isArray(payload.commits)
    ? (payload.commits as Array<Record<string, unknown>>)
        .map((c) => (c && typeof c === 'object' ? c.sha : undefined))
        .filter((s): s is string => typeof s === 'string')
    : [];

  // A merge/squash push can land a few seconds (or minutes) after GitHub stamps
  // merged_at, so allow a small tolerance on the upper bound.
  const TOLERANCE_MS = 10 * 60 * 1000;

  const matches = prWindows.filter((w) => {
    if (w.mergedAt == null) return false;

    // An explicit pr_number tag (set by backfill for head commits) is
    // authoritative: no time/branch inference needed.
    const tagged = Number.isFinite(taggedNumber) && w.prNumber === taggedNumber;
    if (tagged) return true;

    if (w.openedAt != null && pushTime < w.openedAt) return false;
    if (pushTime > w.mergedAt + TOLERANCE_MS) return false;

    if (pushBranch && w.headRef && pushBranch === normalizeBranch(w.headRef)) return true;
    if (w.headSha && (afterSha === w.headSha || commitShas.includes(w.headSha))) return true;
    if (w.mergeCommitSha && (afterSha === w.mergeCommitSha || commitShas.includes(w.mergeCommitSha))) return true;
    if ((w.commitShas ?? []).some((sha) => afterSha === sha || commitShas.includes(sha))) return true;
    if (pushBranch && w.baseRef && pushBranch === normalizeBranch(w.baseRef)) return true;
    return false;
  });

  if (matches.length === 0) return null;
  if (Number.isFinite(taggedNumber)) {
    const exact = matches.find((w) => w.prNumber === taggedNumber);
    if (exact) return exact;
  }
  // Deterministic tie-break: latest merged PR.
  return matches.sort((a, b) => (b.mergedAt ?? 0) - (a.mergedAt ?? 0))[0];
}

/**
 * Build PR lifecycle windows from the repo's pr_opened / pr_merged events.
 */
export function buildPrWindows(events: RawEvent[]): PrWindow[] {
  const byNumber = new Map<number, Partial<PrWindow>>();

  for (const event of events) {
    const type = event.event_type;
    const payload = (event.payload || {}) as Record<string, unknown>;
    const prNumber = Number(payload.pr_number ?? payload.number ?? NaN);
    if (!Number.isFinite(prNumber)) continue;

    const window = byNumber.get(prNumber) ?? { prNumber };
    const ts = new Date(event.created_at).getTime();
    const finiteTs = Number.isFinite(ts) ? ts : null;

    if (type === 'pr_opened') {
      window.openedAt = finiteTs;
      window.baseRef = typeof payload.base_ref === 'string' ? payload.base_ref : window.baseRef;
      window.headRef = typeof payload.head_ref === 'string' ? payload.head_ref : window.headRef;
      window.headSha = typeof payload.head_sha === 'string' ? payload.head_sha : window.headSha;
      window.commitShas = mergeCommitShas(window.commitShas, payload);
    } else if (type === 'pr_merged') {
      window.mergedAt = finiteTs;
      window.baseRef = typeof payload.base_ref === 'string' ? payload.base_ref : window.baseRef;
      window.headRef = typeof payload.head_ref === 'string' ? payload.head_ref : window.headRef;
      window.headSha = typeof payload.head_sha === 'string' ? payload.head_sha : window.headSha;
      window.mergeCommitSha = typeof payload.merge_commit_sha === 'string' ? payload.merge_commit_sha : window.mergeCommitSha;
      window.commitShas = mergeCommitShas(window.commitShas, payload);
    }

    byNumber.set(prNumber, window);
  }

  return Array.from(byNumber.values()).map((w) => ({
    prNumber: w.prNumber!,
    baseRef: w.baseRef ?? null,
    headRef: w.headRef ?? null,
    headSha: w.headSha ?? null,
    mergeCommitSha: w.mergeCommitSha ?? null,
    commitShas: w.commitShas ?? [],
    openedAt: w.openedAt ?? null,
    mergedAt: w.mergedAt ?? null,
  }));
}

function mergeCommitShas(existing: string[] | undefined, payload: Record<string, unknown>): string[] {
  const values = new Set(existing ?? []);
  const direct = payload.commit_shas;
  if (Array.isArray(direct)) {
    for (const sha of direct) if (typeof sha === 'string') values.add(sha);
  }
  const commits = payload.commits;
  if (Array.isArray(commits)) {
    for (const commit of commits) {
      if (commit && typeof commit === 'object' && typeof (commit as Record<string, unknown>).sha === 'string') {
        values.add((commit as Record<string, unknown>).sha as string);
      }
    }
  }
  return Array.from(values);
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
    // Absorbed pushes share the merged PR's candidate (see isPushAbsorbedByPr);
    // this is resolved in aggregateRepoCandidates before correlation keys are
    // built. Standalone pushes fall through to a per-commit key below.
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

  // PR windows let absorbed branch pushes share the merged-PR candidate instead
  // of becoming standalone (double-counted) push candidates.
  const prWindows = buildPrWindows(events);

  // Group event IDs by correlation key, preserving insertion order so the
  // "first event" in extractAndPersistWorkUnits is chronologically correct.
  const grouped = new Map<string, number[]>();

  for (const event of events) {
    let key: string | null = null;

    if (event.event_type === 'push') {
      const absorbed = isPushAbsorbedByPr(event, prWindows);
      if (absorbed) {
        key = `pr:${repoId}:${absorbed.prNumber}`;
      }
    }

    if (!key) key = buildCorrelationKey(repoId, event);
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
      // Only re-flag (and re-write) when the event set actually changed. Without
      // this guard every classifyRepo call re-marks ALL classified candidates as
      // needs_reclassification, causing needless re-extraction churn and letting
      // failed runs pile up thousands of stale flags.
      const changed = !sameEventIds(candidate.source_event_ids, eventIds);
      if (changed) {
        toUpdate.push({ id: candidate.id, source_event_ids: eventIds });
      }
      resultCandidates.push({
        ...candidate,
        source_event_ids: eventIds,
        status: changed
          ? candidate.status === 'classified'
            ? 'needs_reclassification'
            : candidate.status
          : candidate.status,
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

import { createHash } from 'crypto';
import { sql } from '../db';
import { callStructured, hasApiKey, type AiCallOptions } from '../ai/openrouter';
import { acquireSlot } from '../rate-limit';
import { derive } from './derivation';
import { correctLowConfidenceFacts, extractHeuristicFacts, classifyWorkTypeFromText, determineScope } from './heuristic-fallback';
import { buildRationale } from './rationale';
import { reviewValue } from './review';
import { resolveAttribution } from './attribution';
import {
  loadCapabilityLedger,
  loadRepoGoalTree,
  upsertCapabilityLedgerRow,
  clampCentrality,
  formatGoalTreeBlock,
  type CapabilityLedgerRow,
} from './goals';
import type { Facts, ReviewFacts, ScoringConfig, WorkRole, WorkType } from './types';
import type { WorkUnitCandidate } from './aggregator';

export interface ExtractedWorkItem {
  work_type: WorkType;
  role: WorkRole;
  capability_key: string;
  summary: string;
  facts: Facts;
  confidence: number;
  source_commit_shas: string[];
  action?: 'add' | 'update' | 'keep' | 'supersede';
  previous_capability_key?: string | null;
  /** How directly this unit advances the repo's primary goals (1-5, default 3). */
  goal_alignment?: number;
}

/**
 * A single active work unit in the repo-wide capability registry. Extraction
 * must reconcile against the whole repo's previously-shipped capabilities, not
 * just the current candidate's own units, so the same capability gets the same
 * capability_key across PRs and lifecycle roles stay consistent.
 */
export interface RepoCapabilityUnit {
  id: number;
  candidate_id: number;
  capability_key: string;
  role?: string | null;
  summary?: string | null;
  shipped_at?: string | null;
  created_at?: string;
  source_event_ids?: number[];
}

/**
 * Load the repo-wide capability registry: the most recently shipped active
 * work units for this repo. Used to seed the extraction prompt and to
 * reconcile new units against capabilities built in earlier PRs/pushes so we
 * do not create independent duplicate capability_keys for the same feature.
 *
 * Candidates in `excludeCandidateIds` are omitted so a candidate never matches
 * its own not-yet-superseded units through the cross-candidate path (its own
 * units are handled by the candidate-scoped `previousUnits` reconciliation).
 */
export async function loadRepoCapabilityRegistry(
  repoId: number,
  options?: { excludeCandidateIds?: number[]; limit?: number }
): Promise<RepoCapabilityUnit[]> {
  const excludes = options?.excludeCandidateIds ?? [];
  const limit = options?.limit ?? 80;
  if (excludes.length === 0) {
    return (await sql`
      SELECT id, candidate_id, capability_key, role, summary, shipped_at, created_at, source_event_ids
      FROM work_units
      WHERE repo_id = ${repoId}
        AND COALESCE(unit_status, 'active') = 'active'
        AND capability_key IS NOT NULL AND capability_key <> ''
      ORDER BY shipped_at DESC NULLS LAST, created_at DESC
      LIMIT ${limit}
    `) as unknown as RepoCapabilityUnit[];
  }
  return (await sql`
    SELECT id, candidate_id, capability_key, role, summary, shipped_at, created_at, source_event_ids
    FROM work_units
    WHERE repo_id = ${repoId}
      AND COALESCE(unit_status, 'active') = 'active'
      AND capability_key IS NOT NULL AND capability_key <> ''
      AND NOT (candidate_id = ANY(${excludes}::bigint[]))
    ORDER BY shipped_at DESC NULLS LAST, created_at DESC
    LIMIT ${limit}
  `) as unknown as RepoCapabilityUnit[];
}

export function formatCapabilityRegistry(
  units: Array<{ capability_key?: string | null; role?: string | null; summary?: string | null }>
): string {
  if (units.length === 0) return '';
  return units
    .map((unit) => `- ${unit.capability_key ?? '(unknown)'} [${unit.role ?? 'feature'}]: ${unit.summary ?? ''}`)
    .join('\n');
}

/**
 * Extract commit messages from all events in a candidate.
 * Push events store messages inside payload.commits[].message.
 */
export function extractCommitMessages(
  events: Array<Record<string, unknown>>
): string[] {
  const messages: string[] = [];
  for (const event of events) {
    const payload = (event.payload || {}) as Record<string, unknown>;
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    for (const c of commits) {
      if (c && typeof c === 'object') {
        const msg = (c as Record<string, unknown>).message;
        if (typeof msg === 'string' && msg.trim()) {
          messages.push(msg.trim());
        }
      }
    }
  }
  return messages;
}

/**
 * Find the best title across all events in a candidate.
 * PR events carry a descriptive title; push events only have commit messages.
 */
export function extractBestTitle(
  events: Array<Record<string, unknown>>,
  eventType: string
): string {
  for (const event of events) {
    const payload = (event.payload || {}) as Record<string, unknown>;
    if (typeof payload.title === 'string' && payload.title.trim()) {
      return payload.title.trim();
    }
  }
  // For push events, fall back to the first commit message
  const commitMessages = extractCommitMessages(events);
  if (commitMessages.length > 0) {
    return commitMessages[0];
  }
  return eventType;
}

/**
 * Merge size metrics from ALL events in a candidate.
 * The pr_merged event usually carries the real additions/deletions/changed_files,
 * but extraction previously only looked at firstEvent (pr_opened) which lacks them.
 */
export function extractMergedSizeMetrics(
  events: Array<Record<string, unknown>>
): { additions: number; deletions: number; changedFiles: number; commitCount: number } {
  let bestAdditions = 0;
  let bestDeletions = 0;
  let bestChangedFiles = 0;
  let bestCommitCount = 0;

  for (const event of events) {
    const payload = (event.payload || {}) as Record<string, unknown>;
    const additions = typeof payload.additions === 'number' ? payload.additions : 0;
    const deletions = typeof payload.deletions === 'number' ? payload.deletions : 0;
    const changedFiles = typeof payload.changed_files === 'number' ? payload.changed_files : 0;
    const webhookFileCount = ['added', 'modified', 'removed'].reduce((count, field) => {
      const values = payload[field];
      return count + (Array.isArray(values) ? values.length : 0);
    }, 0);
    const evidenceFileCount = Array.isArray(payload.files) ? payload.files.length : 0;
    const commitCount =
      typeof payload.commit_count === 'number'
        ? payload.commit_count
        : Array.isArray(payload.commits)
          ? payload.commits.length
          : 0;

    bestAdditions = Math.max(bestAdditions, additions);
    bestDeletions = Math.max(bestDeletions, deletions);
    bestChangedFiles = Math.max(bestChangedFiles, changedFiles, webhookFileCount, evidenceFileCount);
    bestCommitCount = Math.max(bestCommitCount, commitCount);
  }

  return {
    additions: bestAdditions,
    deletions: bestDeletions,
    changedFiles: bestChangedFiles,
    commitCount: bestCommitCount,
  };
}

/**
 * Extract PR body text if available across any event in the candidate.
 */
export function extractPrBody(
  events: Array<Record<string, unknown>>
): string | null {
  for (const event of events) {
    const payload = (event.payload || {}) as Record<string, unknown>;
    if (typeof payload.body === 'string' && payload.body.trim()) {
      return payload.body.trim();
    }
  }
  return null;
}

export function isCandidateShipped(events: Array<Record<string, unknown>>): boolean {
  return events.some((event) => {
    const type = String(event.event_type || '');
    return type === 'pr_merged' || type === 'push' || type === 'issue_closed';
  });
}

export function extractShippedAt(events: Array<Record<string, unknown>>): string | null {
  // A branch push is evidence of implementation, but PR merge is the actual
  // shipping boundary. Prefer it whenever the candidate contains one.
  const merged = events
    .filter((event) => String(event.event_type || '') === 'pr_merged')
    .sort((a, b) => new Date(String(a.created_at || 0)).getTime() - new Date(String(b.created_at || 0)).getTime());
  const shipped = merged.length > 0 ? merged : events
    .filter((event) => ['push', 'issue_closed'].includes(String(event.event_type || '')))
    .sort((a, b) => new Date(String(a.created_at || 0)).getTime() - new Date(String(b.created_at || 0)).getTime());
  return shipped.length > 0 && typeof shipped[0].created_at === 'string' ? shipped[0].created_at : null;
}

export function extractSourceCommitShas(events: Array<Record<string, unknown>>): string[] {
  const shas = new Set<string>();
  for (const event of events) {
    const payload = (event.payload || {}) as Record<string, unknown>;
    const direct = payload.commit_shas;
    if (Array.isArray(direct)) {
      for (const sha of direct) if (typeof sha === 'string' && sha) shas.add(sha);
    }
    const commits = payload.commits;
    if (Array.isArray(commits)) {
      for (const commit of commits) {
        if (commit && typeof commit === 'object') {
          const sha = (commit as Record<string, unknown>).sha;
          if (typeof sha === 'string' && sha) shas.add(sha);
        }
      }
    }
    const after = event.after_sha;
    if (typeof after === 'string' && after) shas.add(after);
  }
  return Array.from(shas);
}

export function extractChangedFilePaths(events: Array<Record<string, unknown>>): string[] {
  const files = new Set<string>();
  const addFile = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) files.add(value.trim());
  };
  for (const event of events) {
    const payload = (event.payload || {}) as Record<string, unknown>;
    for (const field of ['file_paths', 'modified', 'added', 'removed']) {
      const values = payload[field];
      if (Array.isArray(values)) values.forEach(addFile);
    }
    for (const field of ['files', 'commits']) {
      const values = payload[field];
      if (!Array.isArray(values)) continue;
      for (const value of values) {
        if (!value || typeof value !== 'object') continue;
        const row = value as Record<string, unknown>;
        addFile(row.filename);
        addFile(row.previous_filename);
        if (Array.isArray(row.files)) {
          for (const nested of row.files) {
            if (nested && typeof nested === 'object') addFile((nested as Record<string, unknown>).filename);
          }
        }
      }
    }
  }
  return Array.from(files).sort();
}

export function extractCodeEvidence(events: Array<Record<string, unknown>>): string[] {
  const snippets: string[] = [];
  for (const event of events) {
    const payload = (event.payload || {}) as Record<string, unknown>;
    const collect = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      const row = value as Record<string, unknown>;
      const filename = typeof row.filename === 'string' ? row.filename : 'unknown file';
      const patch = typeof row.patch === 'string' ? row.patch.trim() : '';
      if (patch) snippets.push(`${filename}\n${patch.slice(0, 3500)}`);
    };
    for (const field of ['files', 'commits']) {
      const values = payload[field];
      if (!Array.isArray(values)) continue;
      for (const value of values) {
        collect(value);
        if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).files)) {
          for (const nested of (value as Record<string, unknown>).files as unknown[]) collect(nested);
        }
      }
    }
  }
  return snippets.slice(0, 40);
}

export function buildEvidenceHash(
  candidate: WorkUnitCandidate,
  events: Array<Record<string, unknown>>,
  configVersion: string,
  previousUnits: Array<{ capability_key?: string | null; summary?: string | null; role?: string | null }>,
  repoCapabilities: Array<{ capability_key?: string | null; summary?: string | null; role?: string | null }> = [],
  goalTreeBlock?: string
): string {
  const evidence = {
    candidate: candidate.correlation_key,
    event_ids: candidate.source_event_ids.map(Number).sort((a, b) => a - b),
    events,
    previous: previousUnits.map((unit) => ({
      capability_key: unit.capability_key ?? null,
      summary: unit.summary ?? null,
      role: unit.role ?? null,
    })),
    // Cross-candidate context determines how a new unit reconciles. If the
    // repo registry changes (a capability was built in an earlier candidate),
    // a cached response is stale and must not be reused.
    repo: repoCapabilities.map((unit) => ({
      capability_key: unit.capability_key ?? null,
      summary: unit.summary ?? null,
      role: unit.role ?? null,
    })),
    // The repo goal tree drives key reuse and goal_alignment decisions. If it
    // changes (README/PR surface changed), cached extractions are stale.
    goalTree: goalTreeBlock ? createHash('sha256').update(goalTreeBlock).digest('hex') : null,
    configVersion,
    promptVersion: EXTRACTION_PROMPT_VERSION,
  };
  return createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
}

/**
 * Derive a smarter WorkType from the event type and title.
 */
function deriveWorkType(eventType: string, titleOrMessage: string): WorkType {
  if (eventType === 'issue_closed') return 'BugFix';
  return classifyWorkTypeFromText(titleOrMessage);
}

export async function extractAndPersistWorkUnits(
  candidate: WorkUnitCandidate,
  config: ScoringConfig,
  aiOptions?: AiCallOptions,
  goalTreeBlock?: string
): Promise<number> {
  const events = await sql`
    SELECT id, repo_id, contributor_id, event_type, payload, created_at, before_sha, after_sha
    FROM github_events
    WHERE id = ANY(${candidate.source_event_ids}::bigint[])
    ORDER BY created_at ASC
  `;

  if (events.length === 0) return 0;

  const previousUnits = (await sql`
    SELECT id, ledger_id, capability_key, summary, role, unit_status
    FROM work_units
    WHERE candidate_id = ${candidate.id} AND COALESCE(unit_status, 'active') = 'active'
    ORDER BY id ASC
  `) as Array<{ id: number; ledger_id?: number | null; capability_key?: string | null; summary?: string | null; role?: string | null; unit_status?: string }>;

  // Repo-wide capability registry drives cross-candidate consistency: a later
  // PR that advances or repairs a capability built earlier reuses its key and
  // merges into the same canonical work unit instead of minting a duplicate.
  const repoCapabilities = await loadRepoCapabilityRegistry(candidate.repo_id, {
    excludeCandidateIds: [candidate.id],
  });

  // Repo overview lets the model judge each unit's place in the whole repo
  // (foundational subsystem vs isolated tweak) instead of in a per-PR vacuum.
  const { buildRepoOverviewBlock } = await import('./repo-context');
  const repoOverviewBlock = await buildRepoOverviewBlock(candidate.repo_id);

  // Repo goal tree drives repo-goal-aware extraction and deterministic
  // centrality. Loaded once per classifyRepo pass and threaded in; falls back
  // to reading the stored tree when called standalone.
  let resolvedGoalTreeBlock = goalTreeBlock;
  if (!resolvedGoalTreeBlock) {
    const { loadRepoGoalTree, formatGoalTreeBlock } = await import('./goals');
    const tree = await loadRepoGoalTree(candidate.repo_id).catch(() => null);
    resolvedGoalTreeBlock = tree ? formatGoalTreeBlock(tree) : '';
  }

  const firstEvent = events[0];
  const repoId = candidate.repo_id;
  const contributorId = firstEvent.contributor_id as number;
  const eventType = firstEvent.event_type as string;
  const payload = (firstEvent.payload || {}) as Record<string, unknown>;

  // ─── Review candidates ────────────────────────────────────────────────────
  if (eventType === 'review_submitted') {
    const state = String(payload.state || '').toLowerCase();
    const wordCount = typeof payload.word_count === 'number' ? payload.word_count : 0;
    const body = String(payload.body || '');

    let substantiveness: ReviewFacts['substantiveness'] = 'rubber_stamp';
    if (wordCount > 50 || state === 'changes_requested') {
      substantiveness = 'thorough';
    } else if (wordCount > 20 || state === 'approved') {
      substantiveness = 'moderate';
    } else if (wordCount > 5) {
      substantiveness = 'light';
    }

    const blockingIssueFound =
      state === 'changes_requested' ||
      /\b(bug|issue|fix|blocking|problem|error)\b/i.test(body);

    const reviewFacts: ReviewFacts = {
      substantiveness,
      blocking_issue_found: blockingIssueFound,
      confirmed_valid: blockingIssueFound,
    };

    const derivedValue = reviewValue(reviewFacts);
    const derived = {
      difficulty: 1,
      impact_base: 1,
      execution_quality: 1,
      novelty: 1,
      risk: 1,
      value: derivedValue,
    };

    const rationale = buildRationale(reviewFacts, 'Review');

    const reviewSummary = `${substantiveness} code review${blockingIssueFound ? ' that raised a blocking issue' : ''}`;
    const existingReview = await sql`
      SELECT id FROM work_units
      WHERE candidate_id = ${candidate.id} AND work_type = 'Review' AND COALESCE(unit_status, 'active') = 'active'
      ORDER BY id DESC LIMIT 1
    `;
    const reviewId = existingReview.length > 0
      ? existingReview[0].id as number
      : ((await sql`
          INSERT INTO work_units (
            repo_id, candidate_id, work_type, role, capability_key, source_commit_shas, unit_status,
            summary, facts, derived, derivation_ruleset_version,
            extraction_confidence, extraction_source, flagged_for_review, shipped,
            rationale, size_metrics, shipped_at, source_event_ids
          ) VALUES (
            ${repoId}, ${candidate.id}, 'Review', 'review', ${`review:${candidate.id}`}, '{}', 'active',
            ${reviewSummary}, ${JSON.stringify(reviewFacts)}, ${JSON.stringify(derived)},
            ${config.version}, 1.0, 'heuristic_fallback', false, true,
            ${JSON.stringify(rationale)}, NULL, ${firstEvent.created_at as string}, ${candidate.source_event_ids}
          )
          RETURNING id
        `)[0]?.id as number | undefined);

    if (existingReview.length > 0) {
      await sql`
        UPDATE work_units
        SET summary = ${reviewSummary}, facts = ${JSON.stringify(reviewFacts)}, derived = ${JSON.stringify(derived)},
            derivation_ruleset_version = ${config.version}, shipped = true, shipped_at = ${firstEvent.created_at as string},
            source_event_ids = ${candidate.source_event_ids}, unit_status = 'active'
        WHERE id = ${reviewId}
      `;
    }

    if (reviewId) {
      await sql`DELETE FROM work_unit_contributors WHERE work_unit_id = ${reviewId}`;
      await sql`
        INSERT INTO work_unit_contributors (work_unit_id, contributor_id, attribution_weight)
        VALUES (${reviewId}, ${contributorId}, 1.0)
        ON CONFLICT DO NOTHING
      `;
    }

    await sql`
      UPDATE work_unit_candidates
      SET status = 'classified', classified_at = NOW(), extraction_revision = COALESCE(extraction_revision, 0) + 1,
          evidence_hash = ${buildEvidenceHash(candidate, events as Array<Record<string, unknown>>, config.version, previousUnits, repoCapabilities, resolvedGoalTreeBlock)}
      WHERE id = ${candidate.id}
    `;

    return 1;
  }

  // ─── PR / Push / Issue candidates ─────────────────────────────────────────
  // Scan ALL events in the candidate for the best available data:
  // - PR title (from pr_opened or pr_merged)
  // - Commit messages (from push events — previously ignored entirely)
  // - Size stats (from pr_merged, which carries additions/deletions/changed_files
  //   but was missed because only firstEvent/pr_opened was used)
  // - PR body (from pr_opened if present)
  const titleOrMessage = extractBestTitle(events as Array<Record<string, unknown>>, eventType);
  const commitMessages = extractCommitMessages(events as Array<Record<string, unknown>>);
  const prBody = extractPrBody(events as Array<Record<string, unknown>>);
  const changedFilePaths = extractChangedFilePaths(events as Array<Record<string, unknown>>);
  const codeEvidence = extractCodeEvidence(events as Array<Record<string, unknown>>);
  const sourceCommitShas = extractSourceCommitShas(events as Array<Record<string, unknown>>);
  const { additions, deletions, changedFiles, commitCount } =
    extractMergedSizeMetrics(events as Array<Record<string, unknown>>);

  if (isMergeOnlyPush(eventType, commitMessages)) {
    await sql`
      UPDATE work_units
      SET unit_status = 'superseded'
      WHERE candidate_id = ${candidate.id} AND COALESCE(unit_status, 'active') = 'active'
    `;
    await sql`
      UPDATE work_unit_candidates
      SET status = 'classified', classified_at = NOW(),
          extraction_revision = COALESCE(extraction_revision, 0) + 1,
          evidence_hash = ${buildEvidenceHash(candidate, events as Array<Record<string, unknown>>, config.version, previousUnits, repoCapabilities, resolvedGoalTreeBlock)}
      WHERE id = ${candidate.id}
    `;
    return 0;
  }

  // Use total lines for scope — for pushes we also use commit count as a
  // rough proxy if no line stats are available.
  const totalLines = additions + deletions || commitCount * 30; // 30 avg lines/commit heuristic
  const reliableSizeEvidence = additions > 0 || deletions > 0 || changedFiles > 0;

  const contentHash = buildEvidenceHash(
    candidate,
    events as Array<Record<string, unknown>>,
    config.version,
    previousUnits,
    repoCapabilities,
    resolvedGoalTreeBlock
  );

  let extractedItems: ExtractedWorkItem[] = [];

  let extractionSource: 'ai' | 'heuristic_fallback' | 'ai_facts_corrected' = 'heuristic_fallback';

  // ── Check classification cache ────────────────────────────────────────────
  const cacheHit = await sql`
    SELECT response FROM classification_cache
    WHERE content_hash = ${contentHash} AND repo_id = ${repoId}
  `;

  if (cacheHit.length > 0) {
    try {
      const parsed = normalizeExtractionResponse(
        cacheHit[0].response,
        titleOrMessage,
        totalLines,
        changedFiles,
        sourceCommitShas,
        reliableSizeEvidence
      );
      if (parsed.length > 0) {
        extractedItems = parsed;
        extractionSource = 'ai';
      }
    } catch {
      /* ignore, fall through to AI or heuristic */
    }
  }

  // ── AI extraction ─────────────────────────────────────────────────────────
  if (extractedItems.length === 0 && hasApiKey(aiOptions)) {
    try {
      const prompt = buildExtractionPrompt(
        titleOrMessage,
        eventType,
        changedFiles,
        additions,
        deletions,
        commitCount,
        commitMessages,
        prBody,
        changedFilePaths,
        previousUnits,
        sourceCommitShas,
        codeEvidence,
        repoCapabilities,
        repoOverviewBlock,
        resolvedGoalTreeBlock,
      );

      await acquireSlot('openrouter');

      const aiResponse = await callStructured(
        [
          { role: 'system', content: EXTRACTION_SYSTEM_MESSAGE },
          { role: 'user', content: prompt },
        ],
        EXTRACTION_SCHEMA,
        'work_unit_extraction',
        aiOptions
      );

      if (aiResponse) {
        const parsed = normalizeExtractionResponse(
          JSON.parse(stripCodeFences(aiResponse)),
          titleOrMessage,
          totalLines,
          changedFiles,
          sourceCommitShas,
          reliableSizeEvidence
        );
        if (parsed.length > 0) {
          extractedItems = parsed;
          if (extractedItems.length > 0) {
            extractionSource = 'ai';
            await sql`
              INSERT INTO classification_cache (content_hash, repo_id, response)
              VALUES (${contentHash}, ${repoId}, ${JSON.stringify(extractedItems)})
              ON CONFLICT (content_hash) DO UPDATE
              SET repo_id = EXCLUDED.repo_id,
                  response = EXCLUDED.response,
                  created_at = NOW()
            `.catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('AI extraction failed, falling back to heuristics:', err);
    }
  }

  // ── Heuristic fallback ────────────────────────────────────────────────────
  if (extractedItems.length === 0) {
    const workType = deriveWorkType(eventType, titleOrMessage);
    const heuristicFacts = extractHeuristicFacts(titleOrMessage, changedFilePaths, additions, deletions);

    // Improve scope for pushes where we don't have file counts
    if (eventType === 'push' && changedFiles === 0 && commitCount > 0) {
      heuristicFacts.scope = determineScope(commitCount, totalLines);
    }

    // Build a better fallback summary: if we have commit messages, use them
    // (joined if multiple). Otherwise fall back to the title.
    let fallbackSummary: string;
    if (commitMessages.length > 1) {
      fallbackSummary = commitMessages.slice(0, 3).join('; ').slice(0, 200);
    } else {
      fallbackSummary = titleOrMessage.slice(0, 200);
    }

    extractedItems = [
      {
        work_type: workType,
        role: coerceWorkRole(undefined, workType, titleOrMessage),
        capability_key: normalizeCapabilityKey(undefined, titleOrMessage, 0),
        summary: fallbackSummary,
        facts: heuristicFacts,
        confidence: 0.5,
        source_commit_shas: sourceCommitShas,
      },
    ];
    extractionSource = 'heuristic_fallback';
  }

  // ── Persist work units ────────────────────────────────────────────────────
  const isShipped = isCandidateShipped(events as Array<Record<string, unknown>>);
  const shippedAt = extractShippedAt(events as Array<Record<string, unknown>>);

  // Split credit across every commit author (proportional to authored commits);
  // falls back to the primary contributor when no author data exists.
  const attribution = await resolveAttribution(
    events as Array<Record<string, unknown>>,
    contributorId
  );

  const persistedCount = await persistExtractedItemsForCandidate(
    candidate,
    events as Array<Record<string, unknown>>,
    config,
    extractedItems,
    extractionSource,
    { previousUnits, repoCapabilities, isShipped, shippedAt, attribution }
  );

  return persistedCount;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT_VERSION = 'v6-evidence-first-reconciliation';

/**
 * Push webhooks can contain merge commits that duplicate an already-shipped PR
 * candidate. They are repository history events, not a second contribution.
 */
export function isMergeOnlyPush(
  eventType: string,
  commitMessages: string[]
): boolean {
  if (eventType !== 'push' || commitMessages.length === 0) return false;
  return commitMessages.every((message) =>
    /^(merge|merged)\s+(pull request|branch|remote)/i.test(message.trim())
  );
}

/**
 * Batch prompts are efficient for small commits, but large PR descriptions
 * often contain several independently shipped capabilities. Those candidates
 * need the richer single-candidate prompt so the model cannot collapse the
 * release-note bullets into one generic unit.
 */
export function shouldPreferIndividualExtraction(input: {
  eventType: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  prBody: string | null;
}): boolean {
  const body = input.prBody ?? '';
  const bulletCount = (body.match(/^\s*[*-]\s+/gm) ?? []).length;
  return (
    input.eventType === 'pr_opened' ||
    input.eventType === 'pr_merged' && (input.additions + input.deletions >= 1000 || input.changedFiles >= 15) ||
    bulletCount >= 4 ||
    body.length >= 1200
  );
}

/**
 * Detect a broad roll-up work unit: one previous-pass unit that collapsed
 * multiple shipped capabilities into a single generic summary. Such units are
 * candidates for refinement into specific topic units.
 *
 * Conservative by design: refining a coherent unit would split one capability
 * into implementation steps, so only clear roll-ups are flagged. A roll-up
 * lists several distinct capabilities (multiple topic conjunctions) and either
 * spans the whole repo (system_wide) or is unusually long. Explicit refinement
 * via `--units=` remains the primary path; this only catches obvious cases.
 */
export function isBroadWorkUnit(unit: {
  summary?: string | null;
  facts?: { scope?: string | null } | null;
  size_metrics?: { changed_files?: number | null } | null;
}): boolean {
  const summary = (unit.summary ?? '').trim();
  const scope = unit.facts?.scope ?? null;
  const files = Number(unit.size_metrics?.changed_files ?? 0);

  // Distinct capabilities joined by "and"/"plus"/"also". Commas are excluded
  // because they frequently separate a file list inside one fix.
  const topicJoins = (summary.match(/\b(and|plus|also|as well as)\b/gi) ?? []).length;

  if (topicJoins < 3) return false;
  if (scope === 'system_wide' && summary.length >= 160) return true;
  if (files >= 20 && summary.length >= 220) return true;
  if (summary.length >= 260 && topicJoins >= 5) return true;

  return false;
}

/**
 * Targeted prompt for breaking a broad roll-up unit into specific topic units.
 * Unlike the full candidate prompt this does not re-extract the whole PR — it
 * focuses the model on enumerating the distinct capabilities hidden inside a
 * single broad summary, so the result is finer-grained than the roll-up.
 */
export function buildBreakdownPrompt(input: {
  broadUnit: { capability_key?: string | null; summary?: string | null; role?: string | null; work_type?: string | null };
  title: string;
  commitMessages: string[];
  changedFilePaths: string[];
  codeEvidence: string[];
  prBody: string | null;
}): string {
  let prompt = `A previous extraction pass collapsed several distinct shipped capabilities into ONE broad work unit. Break it down into its specific topic units.

Broad unit summary: "${input.broadUnit.summary ?? ''}"
Broad unit key: ${input.broadUnit.capability_key ?? '(none)'}

Work item context:
Title: "${input.title}"
`;

  if (input.changedFilePaths.length > 0) {
    prompt += `\nChanged files:\n${input.changedFilePaths.slice(0, 120).join('\n')}\n`;
  }
  if (input.commitMessages.length > 0) {
    prompt += `\nCommit messages:\n${input.commitMessages.slice(0, 15).map((m, i) => `${i + 1}. ${m}`).join('\n')}\n`;
  }
  if (input.prBody) {
    prompt += `\nPR description:\n${input.prBody.slice(0, 1200)}\n`;
  }
  if (input.codeEvidence.length > 0) {
    prompt += `\nCode evidence snippets:\n${input.codeEvidence.join('\n---\n').slice(0, 24000)}\n`;
  }

  prompt += `
Enumerate EVERY distinct capability actually shipped within the broad unit above. Return one work item per capability (typically 2–12). Requirements:
- Each item has its OWN specific capability_key (do not reuse the broad unit's key).
- Set previous_capability_key on every item to the broad unit's key ("${input.broadUnit.capability_key ?? '(none)'}") so the breakdown chains to the original unit.
- summary must name the concrete subsystem, API, or feature (max 200 chars), not repeat the broad summary.
- role: foundation for a first implementation of that specific capability, otherwise feature/advancement/refinement/repair/security/performance.
- Do not split one capability into implementation steps.
- If the broad unit genuinely describes a single capability, return exactly one item describing it precisely.

Respond with JSON: { "items": [...] } using the same item schema as the normal extraction prompt (work_type, role, capability_key, previous_capability_key, summary, facts, confidence).`;
  return prompt;
}

export const EXTRACTION_SYSTEM_MESSAGE = `You are an expert engineering work classifier for a GitHub repository analytics platform called GitRanked. Your job is to analyze GitHub events (pull requests, pushes, issues) and extract distinct, specific work items describing what was actually accomplished.

Critical classification rules:
1. Each summary MUST be SPECIFIC and DESCRIPTIVE — mention actual components, APIs, files, systems, or features modified.
2. Never output generic summaries like "Small scope feature", "Updated code", "Refactored files", "Fixed bug".
3. Work Types: Choose exactly ONE from [Feature, BugFix, Refactor, Performance, Security, Documentation, Testing, Infrastructure].
4. Role is the contribution's place in a capability lifecycle: foundation/build = first implementation or subsystem; feature = a distinct new capability; advancement = extending or upgrading an existing capability; refinement = tuning, usability, quality, or polish; repair = fixing a defect in an existing capability; security/performance = a focused hardening or optimization contribution.
4. Fact Definitions:
   - scope: trivial (≤2 files / ≤20 lines), small (≤5 files / ≤100 lines), medium (≤15 files / ≤400 lines), large (≤35 files / ≤1000 lines), system_wide (35+ files / 1000+ lines). IF stats show 0 additions/files (common on push webhooks), evaluate scope based on the number and complexity of commits/titles.
   - user_visible: true if changes affect UI, public API endpoints, CLI, public docs, or user-facing behavior.
   - breaking_change: true if removing parameters, changing public API schemas, or breaking backward compatibility.
   - cross_cutting: true if touching multiple modules, packages, or cross-layer interfaces.
   - testing_added: true if unit/integration/E2E tests or test files/fixtures were added or updated.
   - documentation_updated: true if updating README, docs, JSDoc/docstrings, or guides.
   - new_algorithm_or_subsystem: true if introducing a brand new module, engine, parser, or core logic subsystem.
   - boilerplate: true if auto-generated code, lockfiles, package bumps, or purely formatting changes.
   - touches_auth: true if touching RBAC, OAuth, JWT, session, password, or security token logic.
   - touches_data_migration: true if touching DB migrations, schema alters, or data transformers.
   - touches_distributed_state: true if touching caches, event queues, webhooks, multi-threading, concurrency, or pub/sub.
   - touches_architecture: true if restructuring core application design, dependency wiring, or module boundaries.
5. If a single commit/PR covers multiple distinct shipped capabilities, split into up to 12 work items. Do not split one feature into implementation steps.
6. Previous-pass units are evidence, not instructions. Keep the same capability_key when the new evidence advances the same capability; use action=update and role=advancement/refinement/repair as appropriate.
7. Consistency across PRs: when the prompt lists repository capabilities already shipped in earlier PRs/pushes, REUSE those exact capability_key values whenever this candidate touches the same capability (build/foundation first time, then advancement/refinement/repair on later PRs). Only create a NEW capability_key for a genuinely new capability. Never create a second, differently-named key for a capability that already exists — otherwise the same feature is counted as multiple independent work units.
8. Repository goals: when the prompt includes the repository goal tree, judge each work item against it. A change that advances a foundational capability (high centrality) is worth more than the same-sized change on a peripheral feature. Set goal_alignment (1-5) accordingly.`;

export function buildExtractionPrompt(
  title: string,
  eventType: string,
  changedFiles: number,
  additions: number,
  deletions: number,
  commitCount: number,
  commitMessages: string[],
  prBody: string | null,
  changedFilePaths: string[] = [],
  previousUnits: Array<{ capability_key?: string | null; summary?: string | null; role?: string | null }> = [],
  sourceCommitShas: string[] = [],
  codeEvidence: string[] = [],
  repoCapabilities: Array<{ capability_key?: string | null; summary?: string | null; role?: string | null }> = [],
  repoOverviewBlock?: string,
  goalTreeBlock?: string
): string {
  const eventLabel =
    eventType === 'pr_merged'
      ? 'pull request (merged)'
      : eventType === 'pr_opened'
        ? 'pull request (opened)'
        : eventType === 'push'
          ? 'push/commit'
          : eventType === 'issue_closed'
            ? 'closed issue'
            : eventType;

  let prompt = `Analyze this GitHub ${eventLabel} and extract every distinct shipped capability (up to 12).

Title: "${title}"
Event type: ${eventType}
Stats: ${changedFiles} files changed, +${additions}/-${deletions} lines${commitCount > 1 ? `, ${commitCount} commits` : ''}
`;

  if (repoOverviewBlock) {
    prompt += `\nRepository context (use this to judge how this change fits the whole repo — foundational subsystems matter more than isolated tweaks):\n${repoOverviewBlock}\n`;
  }

  if (goalTreeBlock) {
    prompt += `\nRepository goals (assign each work item to an existing capability_key below when it builds/advances/refines/repairs that capability; only mint a NEW capability_key for a genuinely new capability. Set goal_alignment 1-5: how directly this change advances the repository's primary goals):\n${goalTreeBlock}\n`;
  }

  if (repoCapabilities.length > 0) {
    prompt += `\nRepository capabilities already shipped in earlier PRs/pushes (reuse these exact capability_key values when this candidate builds, advances, refines, or repairs the same capability; do NOT mint a new key for an existing capability):\n${formatCapabilityRegistry(repoCapabilities)}\n`;
  }

  if (changedFilePaths.length > 0) {
    prompt += `\nChanged files (code evidence):\n${changedFilePaths.slice(0, 120).join('\n')}\n`;
  }
  if (sourceCommitShas.length > 0) {
    prompt += `\nEvidence commit SHAs:\n${sourceCommitShas.slice(0, 100).join(', ')}\n`;
  }
  if (codeEvidence.length > 0) {
    prompt += `\nCode evidence snippets (use these to name the actual shipped feature):\n${codeEvidence.join('\n---\n').slice(0, 24000)}\n`;
  }

  if (commitMessages.length > 0) {
    const limited = commitMessages.slice(0, 15);
    prompt += `\nCommit messages:\n${limited.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n`;
  }

  if (prBody) {
    prompt += `\nPR description:\n${prBody.slice(0, 1200)}\n`;
  }

  if (previousUnits.length > 0) {
    prompt += `\nPrevious extraction pass — reconcile against these active capability units:\n${previousUnits
      .map((unit) => `- ${unit.capability_key ?? '(legacy)'} [${unit.role ?? 'feature'}]: ${unit.summary ?? ''}`)
      .join('\n')}\n`;
    const releaseBulletCount = (prBody?.match(/^\s*[*-]\s+/gm) ?? []).length;
    prompt += `Important: the previous pass may have collapsed multiple shipped capabilities into one roll-up. Re-enumerate the current evidence from scratch; do not preserve the previous unit count. ${releaseBulletCount >= 4 ? `This release description contains at least ${releaseBulletCount} capability bullets, so return separate units for each distinct shipped capability rather than one combined summary.` : ''}\n`;
  }

  prompt += `

For each work item return JSON with these fields:
- work_type: exactly one of Feature | BugFix | Refactor | Performance | Security | Documentation | Testing | Infrastructure
- role: exactly one of foundation | build | feature | advancement | refinement | repair | security | performance
- capability_key: stable snake_case key for the shipped capability; reuse a previous key when this is the same capability
- previous_capability_key: the existing capability_key this item updates, when reusing a repository capability (see the repository capabilities list); omit for new capabilities
- action: add | update | keep; use update for a capability that was extended, refined, repaired, or upgraded
- source_commit_shas: commit SHAs that contain the evidence for this item, when available
- goal_alignment: 1-5 — how directly this change advances the repository's PRIMARY goals (5 = core to the repo's purpose, 3 = a meaningful feature, 1 = peripheral)
- summary: specific description of what was done — mention technologies, components, or systems affected (max 200 chars). Be concrete, not generic.
- facts: {
    scope: trivial | small | medium | large | system_wide,
    user_visible: bool,
    breaking_change: bool,
    cross_cutting: bool,
    testing_added: bool,
    documentation_updated: bool,
    new_algorithm_or_subsystem: bool,
    boilerplate: bool,
    touches_auth: bool,
    touches_data_migration: bool,
    touches_distributed_state: bool,
    touches_architecture: bool
  }
- confidence: 0.0-1.0 (how sure you are about the work_type and facts)

Scope guidance:
- trivial: ≤2 files, ≤20 lines
- small: ≤5 files, ≤100 lines
- medium: ≤15 files, ≤400 lines
- large: ≤35 files, ≤1000 lines
- system_wide: 35+ files or 1000+ lines

If the stats show 0 files and 0 lines (common for push events where stats aren't available), infer scope from the commit messages and their apparent complexity.

Example response:
{
  "items": [
    {
      "work_type": "Feature",
      "role": "foundation",
      "capability_key": "rbac_permissions",
      "action": "add",
      "source_commit_shas": [],
      "summary": "Add RBAC models with role-based permission system and database migrations",
      "facts": { "scope": "medium", "user_visible": false, "breaking_change": false, "cross_cutting": true, "testing_added": false, "documentation_updated": false, "new_algorithm_or_subsystem": true, "boilerplate": false, "touches_auth": true, "touches_data_migration": true, "touches_distributed_state": false, "touches_architecture": true },
      "goal_alignment": 5,
      "confidence": 0.85
    }
  ]
}

Respond with JSON: { "items": [...] }. Include one item for each distinct capability actually shipped; do not let line count or commit count substitute for capability evidence.`;

  return prompt;
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          work_type: { type: 'string', enum: ['Feature', 'BugFix', 'Refactor', 'Performance', 'Security', 'Documentation', 'Testing', 'Infrastructure'] },
          role: { type: 'string', enum: ['foundation', 'build', 'feature', 'advancement', 'refinement', 'repair', 'security', 'performance'] },
          capability_key: { type: 'string' },
          action: { type: 'string', enum: ['add', 'update', 'keep', 'supersede'] },
          source_commit_shas: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
          goal_alignment: { type: 'integer', minimum: 1, maximum: 5 },
          facts: {
            type: 'object',
            properties: {
              scope: { type: 'string', enum: ['trivial', 'small', 'medium', 'large', 'system_wide'] },
              user_visible: { type: 'boolean' },
              breaking_change: { type: 'boolean' },
              cross_cutting: { type: 'boolean' },
              testing_added: { type: 'boolean' },
              documentation_updated: { type: 'boolean' },
              new_algorithm_or_subsystem: { type: 'boolean' },
              boilerplate: { type: 'boolean' },
              touches_auth: { type: 'boolean' },
              touches_data_migration: { type: 'boolean' },
              touches_distributed_state: { type: 'boolean' },
              touches_architecture: { type: 'boolean' },
            },
          },
          confidence: { type: 'number' },
        },
        required: ['work_type', 'summary', 'facts', 'confidence'],
      },
    },
  },
  required: ['items'],
};

const VALID_WORK_TYPES = new Set<WorkType>([
  'Feature', 'BugFix', 'Refactor', 'Performance',
  'Security', 'Documentation', 'Testing', 'Infrastructure', 'Review',
]);

function coerceWorkType(raw: string): WorkType {
  // Handle common AI variations
  const normalized = raw
    .replace(/\s+/g, '')
    .replace(/^bug.?fix$/i, 'BugFix')
    .replace(/^infra(structure)?$/i, 'Infrastructure')
    .replace(/^doc(s|umentation)?$/i, 'Documentation')
    .replace(/^test(ing|s)?$/i, 'Testing')
    .replace(/^perf(ormance)?$/i, 'Performance')
    .replace(/^security$/i, 'Security')
    .replace(/^refactor(ing)?$/i, 'Refactor')
    .replace(/^feature?$/i, 'Feature');

  // Title-case match
  const titleCased = (normalized.charAt(0).toUpperCase() + normalized.slice(1)) as WorkType;
  if (VALID_WORK_TYPES.has(titleCased)) return titleCased;

  // Exact match
  if (VALID_WORK_TYPES.has(raw as WorkType)) return raw as WorkType;

  return 'Feature';
}

const VALID_ROLES = new Set<WorkRole>([
  'foundation', 'build', 'feature', 'advancement', 'refinement', 'repair',
  'security', 'performance', 'review',
]);

export function coerceWorkRole(raw: unknown, workType: WorkType, summary: string): WorkRole {
  const normalized = String(raw ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  // Models often call the first implementation a generic "feature" even
  // when the evidence says it introduced a service, layer, module, or UI
  // subsystem. Preserve explicit lifecycle roles, but correct that common
  // ambiguity from the shipped-code description.
  if (normalized === 'feature' && /\b(introduc|created?|added?|new|built?|scaffold|bootstrap).{0,48}\b(layer|service|module|subsystem|dashboard|index|engine|pipeline|architecture)\b/i.test(summary)) {
    return 'foundation';
  }
  if (VALID_ROLES.has(normalized as WorkRole)) return normalized as WorkRole;
  if (workType === 'Review') return 'review';
  if (workType === 'Security') return 'security';
  if (workType === 'Performance') return 'performance';
  if (workType === 'BugFix' || /\b(fix|bug|error|repair|correct|patch)\b/i.test(summary)) return 'repair';
  if (/\b(advance|upgrade|extend|enhance|improve|add support|integrat)\b/i.test(summary)) return 'advancement';
  if (/\b(refin|tune|polish|cleanup|harden|optimi[sz])\b/i.test(summary)) return 'refinement';
  if (/\b(scaffold|bootstrap|initial|foundation|architecture|introduc|new subsystem|build)\b/i.test(summary)) return 'foundation';
  return 'feature';
}

function coerceFacts(
  raw: unknown,
  title: string,
  totalLines: number,
  changedFiles: number,
  reliableSizeEvidence = true
): Facts {
  const heuristic = extractHeuristicFacts(title, [], Math.max(totalLines, 0));
  if (!raw || typeof raw !== 'object') return heuristic;

  const f = raw as Record<string, unknown>;

  const scopeValues = ['trivial', 'small', 'medium', 'large', 'system_wide'];
  const rawScope = String(f.scope ?? '');
  const evidenceScope = determineScope(changedFiles, totalLines);
  // Real PR stats are authoritative. A model must not downgrade a 5k-line,
  // 27-file shipped change to "large" or inflate a stats-less push to a
  // system-wide contribution. For push events with no diff stats, cap the
  // inferred scope at medium because the code evidence is unavailable.
  const modelScope = scopeValues.includes(rawScope)
    ? (rawScope as Facts['scope'])
    : evidenceScope;
  const scope = reliableSizeEvidence
    ? evidenceScope
    : modelScope === 'system_wide' || modelScope === 'large'
      ? 'medium'
      : modelScope;

  return {
    scope,
    user_visible: reliableSizeEvidence ? Boolean(f.user_visible ?? heuristic.user_visible) : heuristic.user_visible,
    breaking_change: reliableSizeEvidence ? Boolean(f.breaking_change ?? false) : heuristic.breaking_change,
    cross_cutting: reliableSizeEvidence ? Boolean(f.cross_cutting ?? heuristic.cross_cutting) : heuristic.cross_cutting,
    testing_added: reliableSizeEvidence ? Boolean(f.testing_added ?? heuristic.testing_added) : heuristic.testing_added,
    documentation_updated: reliableSizeEvidence ? Boolean(f.documentation_updated ?? heuristic.documentation_updated) : heuristic.documentation_updated,
    new_algorithm_or_subsystem: reliableSizeEvidence ? Boolean(f.new_algorithm_or_subsystem ?? false) : heuristic.new_algorithm_or_subsystem,
    boilerplate: reliableSizeEvidence ? Boolean(f.boilerplate ?? heuristic.boilerplate) : heuristic.boilerplate,
    touches_auth: reliableSizeEvidence ? Boolean(f.touches_auth ?? heuristic.touches_auth) : heuristic.touches_auth,
    touches_data_migration: reliableSizeEvidence ? Boolean(f.touches_data_migration ?? heuristic.touches_data_migration) : heuristic.touches_data_migration,
    touches_distributed_state: reliableSizeEvidence ? Boolean(f.touches_distributed_state ?? heuristic.touches_distributed_state) : heuristic.touches_distributed_state,
    touches_architecture: reliableSizeEvidence ? Boolean(f.touches_architecture ?? heuristic.touches_architecture) : heuristic.touches_architecture,
  };
}

function normalizeCapabilityKey(raw: unknown, summary: string, index: number): string {
  const supplied = String(raw ?? '').trim().toLowerCase();
  if (supplied) return supplied.replace(/[^a-z0-9_.:-]+/g, '_').slice(0, 160);
  const normalized = summary.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `cap:${createHash('sha1').update(normalized || `item_${index}`).digest('hex').slice(0, 16)}`;
}

/**
 * Normalize both strict JSON responses and the looser object/map responses
 * returned by models that do not support JSON schema (including OpenCode Go).
 */
export function normalizeExtractionResponse(
  raw: unknown,
  title: string,
  totalLines: number,
  changedFiles: number,
  sourceCommitShas: string[] = [],
  reliableSizeEvidence = true
): ExtractedWorkItem[] {
  let candidates: unknown[] = [];
  if (Array.isArray(raw)) candidates = raw;
  else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of ['items', 'units', 'work_units', 'changes']) {
      if (Array.isArray(obj[key])) {
        candidates = obj[key] as unknown[];
        break;
      }
    }
    // Some model responses are capability maps, e.g. { retrieval: { ... } }.
    if (candidates.length === 0) {
      candidates = Object.entries(obj)
        .filter(([key]) => !['summary', 'rationale', 'notes'].includes(key))
        .map(([key, value]) => {
          if (typeof value === 'string') return { capability_key: key, summary: value };
          if (value && typeof value === 'object') return { capability_key: key, ...(value as Record<string, unknown>) };
          return { capability_key: key, summary: String(value) };
        });
    }
  }

  return candidates
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, index) => {
      const summary = String(item.summary ?? item.description ?? title).trim().slice(0, 240);
      const workType = coerceWorkType(String(item.work_type ?? item.type ?? 'Feature'));
      const facts = coerceFacts(item.facts ?? item, title, totalLines, changedFiles, reliableSizeEvidence);
      const shas = Array.isArray(item.source_commit_shas)
        ? (item.source_commit_shas as unknown[]).filter((sha): sha is string => typeof sha === 'string')
        : sourceCommitShas;
      return {
        work_type: workType,
        role: coerceWorkRole(item.role, workType, summary),
        capability_key: normalizeCapabilityKey(item.capability_key ?? item.capability ?? item.key, summary, index),
        summary,
        facts,
        confidence: (() => {
          const value = Number(item.confidence ?? 0.7);
          return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.7;
        })(),
        goal_alignment: (() => {
          const value = Number(item.goal_alignment ?? item.alignment ?? 3);
          return Number.isFinite(value) ? Math.max(1, Math.min(5, Math.round(value))) : 3;
        })(),
        source_commit_shas: Array.from(new Set(shas)),
        action: ['add', 'update', 'keep', 'supersede'].includes(String(item.action))
          ? String(item.action) as ExtractedWorkItem['action']
          : undefined,
        previous_capability_key: typeof item.previous_capability_key === 'string' ? item.previous_capability_key : null,
      };
    });
}

export function stripCodeFences(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  }
  return cleaned;
}

export async function persistExtractedItemsForCandidate(
  candidate: WorkUnitCandidate,
  events: Array<Record<string, unknown>>,
  config: ScoringConfig,
  extractedItems: ExtractedWorkItem[],
  extractionSource: 'ai' | 'heuristic_fallback' | 'ai_facts_corrected' = 'heuristic_fallback',
  options?: {
    previousUnits?: Array<{ id: number; ledger_id?: number | null; capability_key?: string | null; summary?: string | null; role?: string | null }>;
    repoCapabilities?: RepoCapabilityUnit[];
    isShipped?: boolean;
    shippedAt?: string | null;
    attribution?: Map<number, number>;
  }
): Promise<number> {
  if (events.length === 0 || extractedItems.length === 0) return 0;

  const firstEvent = events[0];
  const repoId = candidate.repo_id;
  const contributorId = firstEvent.contributor_id as number;
  const eventType = String(firstEvent.event_type || '');

  const titleOrMessage = extractBestTitle(events, eventType);
  const { additions, deletions, changedFiles, commitCount } = extractMergedSizeMetrics(events);

  let persistedCount = 0;
  const isShipped = options?.isShipped ?? isCandidateShipped(events);
  const shippedAt = options?.shippedAt ?? extractShippedAt(events);
  const previousUnits = options?.previousUnits ?? (await sql`
    SELECT id, ledger_id, capability_key, summary, role
    FROM work_units
    WHERE candidate_id = ${candidate.id} AND COALESCE(unit_status, 'active') = 'active'
    ORDER BY id ASC
  `) as Array<{ id: number; ledger_id?: number | null; capability_key?: string | null; summary?: string | null; role?: string | null }>;
  const repoCapabilities = options?.repoCapabilities ?? (await loadRepoCapabilityRegistry(repoId, { excludeCandidateIds: [candidate.id] }));

  // Split credit across every commit author (proportional to authored commits).
  const attribution = options?.attribution ?? (await resolveAttribution(events, contributorId));
  const previousByKey = new Map(previousUnits.filter((unit) => unit.capability_key).map((unit) => [unit.capability_key!, unit]));

  // Repo-goal anchored capability ledger (Phase 2): canonical nodes, UNIQUE per
  // (repo, key). A later PR that reuses a key chains to the node's latest unit,
  // so dedup is enforced structurally — not by the model's memory.
  const [ledgerRows, goalTree] = await Promise.all([
    loadCapabilityLedger(repoId, { limit: 500 }).catch(() => []),
    loadRepoGoalTree(repoId).catch(() => null),
  ]);
  const ledgerByKey = new Map<string, CapabilityLedgerRow>();
  for (const row of ledgerRows) ledgerByKey.set(row.capability_key, row);
  const treeCentrality = new Map<string, number>();
  for (const cap of goalTree?.capabilities ?? []) treeCentrality.set(cap.key, cap.centrality);

  const matchedIds = new Set<number>();

  // Count how many extracted items target each previous unit. When a previous
  // pass collapsed several shipped capabilities into one broad roll-up unit and
  // this pass breaks it apart, multiple items will reference the same previous
  // unit. That unit must be superseded and each item persisted as its own fresh
  // chained unit — updating one row in place N times would lose the breakdown.
  const targetCounts = new Map<number, number>();
  for (const item of extractedItems) {
    const matchKey = item.previous_capability_key || item.capability_key;
    const prev = previousByKey.get(matchKey);
    if (prev) targetCounts.set(prev.id, (targetCounts.get(prev.id) ?? 0) + 1);
  }

  // Units created earlier in THIS pass (same candidate), so a duplicate
  // extraction of the same key chains to the just-written unit instead of
  // minting another independent copy.
  const insertedThisPass: Array<{ id: number; ledger_id: number; capability_key: string }> = [];

  for (const item of extractedItems) {
    let finalFacts = item.facts;
    let itemSource: 'ai' | 'heuristic_fallback' | 'ai_facts_corrected' = extractionSource;

    if (item.confidence < 0.6 && itemSource === 'ai') {
      finalFacts = correctLowConfidenceFacts(item.facts, titleOrMessage);
      itemSource = 'ai_facts_corrected';
    }

    const capabilityKey = item.capability_key;
    // Centrality is deterministic from the goal tree (falling back to the
    // ledger, then 3); it is never re-negotiated by the extraction model.
    const centrality = clampCentrality(
      treeCentrality.get(capabilityKey) ?? ledgerByKey.get(capabilityKey)?.centrality ?? 3
    );
    const goalAlignment = Math.max(1, Math.min(5, Math.round(Number(item.goal_alignment) || 3)));
    const derived = { ...derive(finalFacts, config.derivation_weights), centrality, goal_alignment: goalAlignment };
    const rationale = buildRationale(finalFacts, item.work_type);
    const sizeMetrics = JSON.stringify({ additions, deletions, changed_files: changedFiles, commit_count: commitCount });

    const treeCap = goalTree?.capabilities.find((c) => c.key === capabilityKey);
    const goalSlug = treeCap?.goal ?? 'general';
    const ledgerId = await upsertCapabilityLedgerRow({
      repoId,
      capabilityKey,
      goalSlug,
      title: item.summary,
      summary: item.summary,
      centrality,
      shippedAt: isShipped ? shippedAt : null,
    });

    const matchKey = item.previous_capability_key || item.capability_key;
    const previous =
      // Structural match first: this candidate's own active unit on the same
      // ledger node (deterministic; key drift cannot hide a duplicate).
      previousUnits.find((unit) => unit.ledger_id != null && Number(unit.ledger_id) === ledgerId)
      // Legacy/key fallback (rows predate the ledger).
      ?? previousByKey.get(matchKey)
      // Legacy rows predate capability keys. Reuse the only legacy unit rather
      // than creating a duplicate during the first reconciliation pass.
      ?? (previousUnits.length === 1 && !previousUnits[0].capability_key ? previousUnits[0] : undefined);
    const chainFromThisPass = insertedThisPass.find((u) => u.ledger_id === ledgerId);
    // A breakdown: one previous unit is referenced by multiple extracted items.
    // It was a broad roll-up, so it gets superseded and every item becomes its
    // own chained unit rather than overwriting the same row.
    const isBreakdown = Boolean(previous && (targetCounts.get(previous.id) ?? 0) > 1);
    const chainedToId = isBreakdown
      ? previous?.id
      : previous
        ? null // own unit → updated in place below, no chain
        : chainFromThisPass?.id ?? ledgerByKey.get(matchKey)?.latest_work_unit_id ?? null;
    const sourceCommitShas = item.source_commit_shas.length > 0 ? item.source_commit_shas : extractSourceCommitShas(events);
    let workUnitId: number | null = null;

    if (previous && !isBreakdown) {
      workUnitId = previous.id;
      await sql`
        UPDATE work_units
        SET work_type = ${item.work_type}, role = ${item.role}, capability_key = ${capabilityKey},
            ledger_id = ${ledgerId},
            source_commit_shas = ${sourceCommitShas}, summary = ${item.summary}, facts = ${JSON.stringify(finalFacts)},
            derived = ${JSON.stringify(derived)}, derivation_ruleset_version = ${config.version},
            extraction_confidence = ${item.confidence}, extraction_source = ${itemSource},
            flagged_for_review = false, shipped = ${isShipped}, rationale = ${JSON.stringify(rationale)},
            size_metrics = ${sizeMetrics}, shipped_at = ${isShipped ? shippedAt : null},
            source_event_ids = ${candidate.source_event_ids}, unit_status = 'active'
        WHERE id = ${previous.id}
      `;
      matchedIds.add(previous.id);
    } else {
      // Fresh unit for this candidate. When it reuses a capability built in an
      // earlier candidate (or is part of breaking a broad roll-up apart), record
      // that lineage so the lifecycle is traceable without erasing the original
      // contributor's normalized credit.
      const inserted = await sql`
        INSERT INTO work_units (
          repo_id, candidate_id, work_type, role, capability_key, source_commit_shas, previous_unit_id,
          ledger_id, unit_status, summary, facts, derived, derivation_ruleset_version,
          extraction_confidence, extraction_source, flagged_for_review, shipped,
          rationale, size_metrics, shipped_at, source_event_ids
        ) VALUES (
          ${repoId}, ${candidate.id}, ${item.work_type}, ${item.role}, ${capabilityKey}, ${sourceCommitShas}, ${chainedToId},
          ${ledgerId}, 'active', ${item.summary}, ${JSON.stringify(finalFacts)}, ${JSON.stringify(derived)},
          ${config.version}, ${item.confidence}, ${itemSource}, false, ${isShipped},
          ${JSON.stringify(rationale)}, ${sizeMetrics}, ${isShipped ? shippedAt : null}, ${candidate.source_event_ids}
        )
        RETURNING id
      `;
      if (inserted.length > 0) {
        workUnitId = inserted[0].id as number;
        insertedThisPass.push({ id: workUnitId, ledger_id: ledgerId, capability_key: capabilityKey });
      }
    }

    if (workUnitId !== null) {
      await sql`DELETE FROM work_unit_contributors WHERE work_unit_id = ${workUnitId}`;
      for (const [cid, weight] of attribution) {
        await sql`
          INSERT INTO work_unit_contributors (work_unit_id, contributor_id, attribution_weight)
          VALUES (${workUnitId}, ${cid}, ${weight})
          ON CONFLICT DO NOTHING
        `;
      }
      persistedCount++;

      // Keep the canonical node pointing at this unit (idempotent upsert).
      await upsertCapabilityLedgerRow({
        repoId,
        capabilityKey,
        centrality,
        shippedAt: isShipped ? shippedAt : null,
        latestWorkUnitId: workUnitId,
      });
      const localLedger = ledgerByKey.get(capabilityKey);
      if (localLedger) {
        localLedger.latest_work_unit_id = workUnitId;
        if (isShipped && shippedAt) localLedger.last_shipped_at = shippedAt;
      }
    }
  }

  // AI is allowed to declare a capability set complete. Heuristic fallback is
  // deliberately non-destructive so a transient provider failure never erases
  // a previously rich extraction.
  if (extractionSource !== 'heuristic_fallback' && previousUnits.length > 0) {
    const staleIds = previousUnits.map((unit) => unit.id).filter((id) => !matchedIds.has(id));
    if (staleIds.length > 0) {
      await sql`UPDATE work_units SET unit_status = 'superseded' WHERE id = ANY(${staleIds}::bigint[])`;
    }
  }

  // The evidence hash must include the goal tree so a changed tree busts the
  // classification cache — the tree drives key reuse and goal_alignment.
  const goalTreeBlockForHash = goalTree ? formatGoalTreeBlock(goalTree) : '';

  await sql`
    UPDATE work_unit_candidates
    SET status = 'classified', classified_at = NOW(), extraction_revision = COALESCE(extraction_revision, 0) + 1,
        evidence_hash = ${buildEvidenceHash(candidate, events, config.version, previousUnits, repoCapabilities, goalTreeBlockForHash)}
    WHERE id = ${candidate.id}
  `;

  return persistedCount;
}

export const BATCH_EXTRACTION_SYSTEM_MESSAGE = `You are an expert engineering work classifier for GitRanked. Your job is to analyze multiple GitHub candidates in a single request and extract distinct, specific work items for each candidate.

Critical rules:
1. Return JSON containing a "candidates" array matching each candidate by correlation_key.
2. Each summary MUST be SPECIFIC and DESCRIPTIVE — mention the actual components, files, or technologies involved.
3. For each candidate, return every distinct shipped capability (up to 12) with work_type, role, capability_key, action, source_commit_shas, summary, facts, and confidence score.
4. Reuse capability_key from the candidate's previous pass when the capability is being advanced, refined, or repaired.`;

export const BATCH_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          correlation_key: { type: 'string' },
          items: EXTRACTION_SCHEMA.properties.items,
        },
        required: ['correlation_key', 'items'],
      },
    },
  },
  required: ['candidates'],
};

export function buildBatchExtractionPrompt(
  items: Array<{
    candidate: WorkUnitCandidate;
    titleOrMessage: string;
    eventType: string;
    changedFiles: number;
    additions: number;
    deletions: number;
    commitCount: number;
    commitMessages: string[];
    prBody: string | null;
    changedFilePaths: string[];
    codeEvidence?: string[];
    sourceCommitShas: string[];
    previousUnits: Array<{ id: number; capability_key?: string | null; summary?: string | null; role?: string | null }>;
    repoCapabilities?: RepoCapabilityUnit[];
  }>,
  repoOverviewBlock?: string,
  goalTreeBlock?: string
): string {
  let prompt = `Analyze the following ${items.length} GitHub candidates and extract work items for each candidate.\n\n`;

  if (repoOverviewBlock) {
    prompt += `Repository context (use this to judge how each change fits the whole repo — foundational subsystems matter more than isolated tweaks):\n${repoOverviewBlock}\n\n`;
  }

  if (goalTreeBlock) {
    prompt += `Repository goals (assign each work item to an existing capability_key below when it builds/advances/refines/repairs that capability; only mint a NEW capability_key for a genuinely new capability. Set goal_alignment 1-5 per item: how directly the change advances the repository's primary goals):\n${goalTreeBlock}\n\n`;
  }

  const repoCapabilities = items.find((item) => (item.repoCapabilities?.length ?? 0) > 0)?.repoCapabilities ?? [];
  if (repoCapabilities.length > 0) {
    prompt += `Repository capabilities already shipped in earlier PRs/pushes (reuse these exact capability_key values when a candidate builds, advances, refines, or repairs the same capability; do NOT mint a new key for an existing capability):\n${formatCapabilityRegistry(repoCapabilities)}\n\n`;
  }

  items.forEach((item, index) => {
    prompt += `--- CANDIDATE ${index + 1} (correlation_key: "${item.candidate.correlation_key}") ---\n`;
    prompt += `Title: "${item.titleOrMessage}"\n`;
    prompt += `Event type: ${item.eventType}\n`;
    prompt += `Stats: ${item.changedFiles} files changed, +${item.additions}/-${item.deletions} lines, ${item.commitCount} commits\n`;
    if (item.commitMessages.length > 0) {
      prompt += `Commits:\n${item.commitMessages.slice(0, 10).map((m, i) => `  ${i + 1}. ${m}`).join('\n')}\n`;
    }
    if (item.prBody) {
      prompt += `PR Description:\n${item.prBody.slice(0, 600)}\n`;
    }
    if (item.changedFilePaths && item.changedFilePaths.length > 0) {
      prompt += `Files:\n${item.changedFilePaths.slice(0, 80).join('\n')}\n`;
    }
    if (item.codeEvidence && item.codeEvidence.length > 0) {
      prompt += `Code evidence:\n${item.codeEvidence.join('\n---\n').slice(0, 10000)}\n`;
    }
    if (item.previousUnits && item.previousUnits.length > 0) {
      prompt += `Previous units:\n${item.previousUnits.map((unit) => `  - ${unit.capability_key ?? '(legacy)'} [${unit.role ?? 'feature'}]: ${unit.summary ?? ''}`).join('\n')}\n`;
    }
    prompt += `\n`;
  });

  prompt += `Respond with JSON matching this exact structure:
{
  "candidates": [
    {
      "correlation_key": "pr:1:101",
      "items": [
        {
          "work_type": "Feature",
          "summary": "Add RBAC models with role-based permission system",
          "facts": { "scope": "medium", "user_visible": true, "breaking_change": false, "cross_cutting": true, "testing_added": true, "documentation_updated": false, "new_algorithm_or_subsystem": true, "boilerplate": false, "touches_auth": true, "touches_data_migration": false, "touches_distributed_state": false, "touches_architecture": true },
          "confidence": 0.90
        }
      ]
    }
  ]
}`;

  return prompt;
}

export async function extractAndPersistBatchWorkUnits(
  candidates: WorkUnitCandidate[],
  config: ScoringConfig,
  aiOptions?: AiCallOptions,
  goalTreeBlock?: string
): Promise<number> {
  if (candidates.length === 0) return 0;
  if (candidates.length === 1) {
    return extractAndPersistWorkUnits(candidates[0], config, aiOptions, goalTreeBlock);
  }

  // Resolve the goal tree block once so every candidate in the batch shares the
  // same frame of reference (and the same evidence-hash input).
  let resolvedGoalTreeBlock = goalTreeBlock;
  if (!resolvedGoalTreeBlock) {
    const { loadRepoGoalTree, formatGoalTreeBlock } = await import('./goals');
    const tree = await loadRepoGoalTree(candidates[0].repo_id).catch(() => null);
    resolvedGoalTreeBlock = tree ? formatGoalTreeBlock(tree) : '';
  }

  type BatchCandidateData = {
    candidate: WorkUnitCandidate;
    events: Array<Record<string, unknown>>;
    titleOrMessage: string;
    commitMessages: string[];
    prBody: string | null;
    additions: number;
    deletions: number;
    changedFiles: number;
    commitCount: number;
    eventType: string;
    contentHash: string;
    changedFilePaths: string[];
    codeEvidence: string[];
    sourceCommitShas: string[];
    previousUnits: Array<{ id: number; capability_key?: string | null; summary?: string | null; role?: string | null }>;
    repoCapabilities: RepoCapabilityUnit[];
    reliableSizeEvidence: boolean;
  };

  const uncachedCandidates: (BatchCandidateData | null)[] = [];
  let totalPersisted = 0;

  // One repo-wide capability registry for the whole batch so every candidate
  // reconciles against the same set of previously shipped capabilities.
  const batchCandidateIds = candidates.map((c) => c.id);
  const repoCapabilities = await loadRepoCapabilityRegistry(candidates[0].repo_id, {
    excludeCandidateIds: batchCandidateIds,
  });

  // Repo overview shared across the batch so the model can judge each candidate
  // against the whole repo rather than in a per-PR vacuum.
  const { buildRepoOverviewBlock } = await import('./repo-context');
  const repoOverviewBlock = await buildRepoOverviewBlock(candidates[0].repo_id);

  for (const candidate of candidates) {
    const events = (await sql`
      SELECT id, repo_id, contributor_id, event_type, payload, created_at, before_sha, after_sha
      FROM github_events
      WHERE id = ANY(${candidate.source_event_ids}::bigint[])
      ORDER BY created_at ASC
    `) as Array<Record<string, unknown>>;

    if (events.length === 0) continue;

    const firstEvent = events[0];
    const eventType = String(firstEvent.event_type || '');

    if (eventType === 'review_submitted') {
      const units = await extractAndPersistWorkUnits(candidate, config, aiOptions, resolvedGoalTreeBlock);
      totalPersisted += units;
      continue;
    }

    const titleOrMessage = extractBestTitle(events, eventType);
    const commitMessages = extractCommitMessages(events);
    const prBody = extractPrBody(events);
    const changedFilePaths = extractChangedFilePaths(events);
    const codeEvidence = extractCodeEvidence(events);
    const sourceCommitShas = extractSourceCommitShas(events);
    const { additions, deletions, changedFiles, commitCount } = extractMergedSizeMetrics(events);
    const reliableSizeEvidence = additions > 0 || deletions > 0 || changedFiles > 0;
    const previousUnits = (await sql`
      SELECT id, ledger_id, capability_key, summary, role
      FROM work_units
      WHERE candidate_id = ${candidate.id} AND COALESCE(unit_status, 'active') = 'active'
      ORDER BY id ASC
    `) as Array<{ id: number; ledger_id?: number | null; capability_key?: string | null; summary?: string | null; role?: string | null }>;
    const contentHash = buildEvidenceHash(candidate, events, config.version, previousUnits, repoCapabilities, resolvedGoalTreeBlock);

    const itemData = {
      candidate,
      events,
      titleOrMessage,
      commitMessages,
      prBody,
      changedFilePaths,
      codeEvidence,
      sourceCommitShas,
      previousUnits,
      repoCapabilities,
      additions,
      deletions,
      changedFiles,
      commitCount,
      eventType,
      contentHash,
      reliableSizeEvidence,
    };

    if (isMergeOnlyPush(eventType, commitMessages)) {
      await sql`
        UPDATE work_units
        SET unit_status = 'superseded'
        WHERE candidate_id = ${candidate.id} AND COALESCE(unit_status, 'active') = 'active'
      `;
      await sql`
        UPDATE work_unit_candidates
        SET status = 'classified', classified_at = NOW(),
            extraction_revision = COALESCE(extraction_revision, 0) + 1,
            evidence_hash = ${contentHash}
        WHERE id = ${candidate.id}
      `;
      continue;
    }

    if (shouldPreferIndividualExtraction(itemData)) {
      totalPersisted += await extractAndPersistWorkUnits(candidate, config, aiOptions, resolvedGoalTreeBlock);
      continue;
    }

    const cacheHit = await sql`
      SELECT response FROM classification_cache
      WHERE content_hash = ${contentHash} AND repo_id = ${candidate.repo_id}
    `;

    if (cacheHit.length > 0) {
      try {
        const parsed = normalizeExtractionResponse(
          cacheHit[0].response,
          titleOrMessage,
          additions + deletions,
          changedFiles,
          sourceCommitShas,
          reliableSizeEvidence
        );
        if (parsed.length > 0) {
          const units = await persistExtractedItemsForCandidate(candidate, events, config, parsed, 'ai', { previousUnits });
          totalPersisted += units;
          continue;
        }
      } catch {
        /* ignore, fall through */
      }
    }

    uncachedCandidates.push(itemData);
  }

  if (uncachedCandidates.length === 0) {
    return totalPersisted;
  }

  if (hasApiKey(aiOptions)) {
    try {
      const batchPrompt = buildBatchExtractionPrompt(
        uncachedCandidates.filter((c): c is NonNullable<typeof c> => c !== null),
        repoOverviewBlock,
        goalTreeBlock
      );
      await acquireSlot('openrouter');

      const aiResponse = await callStructured(
        [
          { role: 'system', content: BATCH_EXTRACTION_SYSTEM_MESSAGE },
          { role: 'user', content: batchPrompt },
        ],
        BATCH_EXTRACTION_SCHEMA,
        'batch_work_unit_extraction',
        aiOptions
      );

      if (aiResponse) {
        const parsed = JSON.parse(stripCodeFences(aiResponse));
        if (Array.isArray(parsed.candidates)) {
          const resultMap = new Map<string, Array<Record<string, unknown>>>();
          for (const cRes of parsed.candidates) {
            if (cRes && cRes.correlation_key && Array.isArray(cRes.items)) {
              resultMap.set(cRes.correlation_key, cRes.items);
            }
          }

          for (let idx = 0; idx < uncachedCandidates.length; idx++) {
            const itemData = uncachedCandidates[idx];
            if (!itemData) continue;

            let items = resultMap.get(itemData.candidate.correlation_key);
            if (!items && parsed.candidates[idx] && Array.isArray(parsed.candidates[idx].items)) {
              items = parsed.candidates[idx].items;
            }

            if (items && items.length > 0) {
              const formattedItems = normalizeExtractionResponse(
                items,
                itemData.titleOrMessage,
                itemData.additions + itemData.deletions,
                itemData.changedFiles,
                itemData.sourceCommitShas,
                itemData.reliableSizeEvidence
              );

              await sql`
                INSERT INTO classification_cache (content_hash, repo_id, response)
                VALUES (${itemData.contentHash}, ${itemData.candidate.repo_id}, ${JSON.stringify(formattedItems)})
                ON CONFLICT (content_hash) DO UPDATE
                SET repo_id = EXCLUDED.repo_id,
                    response = EXCLUDED.response,
                    created_at = NOW()
              `.catch(() => {});

              // Reload the registry per candidate so units created earlier in
              // this same batch are visible for cross-candidate reconciliation.
              const freshRegistry = await loadRepoCapabilityRegistry(itemData.candidate.repo_id, {
                excludeCandidateIds: [itemData.candidate.id],
              });
              const units = await persistExtractedItemsForCandidate(itemData.candidate, itemData.events, config, formattedItems, 'ai', {
                previousUnits: itemData.previousUnits,
                repoCapabilities: freshRegistry,
              });
              totalPersisted += units;
              uncachedCandidates[idx] = null;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Batch AI extraction failed, falling back to individual extraction:', err);
    }
  }

  // Fallback for remaining uncached candidates
  for (const itemData of uncachedCandidates) {
    if (!itemData) continue;
    const units = await extractAndPersistWorkUnits(itemData.candidate, config, aiOptions, resolvedGoalTreeBlock);
    totalPersisted += units;
  }

  return totalPersisted;
}

export interface BroadUnit {
  id: number;
  repo_id: number;
  candidate_id: number;
  work_type: string;
  role?: string | null;
  capability_key?: string | null;
  summary?: string | null;
  facts?: Record<string, unknown> | null;
  size_metrics?: Record<string, unknown> | null;
}

/**
 * Find broad roll-up work units in a repo that are candidates for refinement.
 * A unit is broad when it collapsed multiple shipped capabilities (system_wide
 * scope, or a long multi-topic summary). Optionally filter to specific ids.
 */
export async function findBroadWorkUnits(
  repoId: number,
  options?: { unitIds?: number[]; limit?: number }
): Promise<BroadUnit[]> {
  const where = options?.unitIds?.length
    ? sql`AND wu.id = ANY(${options.unitIds}::bigint[])`
    : sql``;
  const rows = (await sql`
    SELECT wu.id, wu.repo_id, wu.candidate_id, wu.work_type, wu.role, wu.capability_key,
           wu.summary, wu.facts, wu.size_metrics
    FROM work_units wu
    WHERE wu.repo_id = ${repoId}
      AND COALESCE(wu.unit_status, 'active') = 'active'
      AND wu.work_type <> 'Review'
      ${where}
    ORDER BY char_length(wu.summary) DESC,
             (wu.size_metrics->>'changed_files')::int DESC NULLS LAST
    LIMIT ${options?.limit ?? 50}
  `) as unknown as BroadUnit[];
  return rows.filter((unit) => isBroadWorkUnit({
    summary: unit.summary,
    facts: unit.facts as { scope?: string | null } | null,
    size_metrics: unit.size_metrics as { changed_files?: number | null } | null,
  }));
}

/**
 * Break broad roll-up work units into specific topic units.
 *
 * For every broad unit in a repo (or a provided subset), this loads the
 * candidate's evidence, runs a targeted breakdown prompt, then persists the
 * resulting specific units chained to the broad unit (previous_unit_id) and
 * supersedes the broad unit so the finer-grained breakdown replaces it.
 *
 * Returns the number of broad units refined.
 */
export async function refineBroadWorkUnits(
  repoId: number,
  aiOptions?: AiCallOptions,
  options?: { unitIds?: number[]; limit?: number }
): Promise<number> {
  const broadUnits = await findBroadWorkUnits(repoId, options);
  if (broadUnits.length === 0 || !hasApiKey(aiOptions)) return 0;

  // Reuse the single-candidate prompt version, but drive it through the
  // breakdown prompt so the model enumerates the hidden capabilities.
  const config = (await import('./config')).getRepoScoringConfig;
  const scoringConfig = await config(repoId);

  let refined = 0;
  for (const broadUnit of broadUnits) {
    try {
      const candidateEventIds = (await sql`
        SELECT source_event_ids FROM work_unit_candidates WHERE id = ${broadUnit.candidate_id}
      `)[0]?.source_event_ids ?? [];
      const events = (await sql`
        SELECT id, repo_id, contributor_id, event_type, payload, created_at, before_sha, after_sha
        FROM github_events
        WHERE id = ANY(${candidateEventIds}::bigint[])
        ORDER BY created_at ASC
      `) as Array<Record<string, unknown>>;

      if (events.length === 0) continue;

      const titleOrMessage = extractBestTitle(events, String(events[0].event_type ?? ''));
      const commitMessages = extractCommitMessages(events);
      const prBody = extractPrBody(events);
      const changedFilePaths = extractChangedFilePaths(events);
      const codeEvidence = extractCodeEvidence(events);
      const sourceCommitShas = extractSourceCommitShas(events);

      const prompt = buildBreakdownPrompt({
        broadUnit,
        title: titleOrMessage,
        commitMessages,
        changedFilePaths,
        codeEvidence,
        prBody,
      });

      await acquireSlot('openrouter');
      const aiResponse = await callStructured(
        [
          { role: 'system', content: EXTRACTION_SYSTEM_MESSAGE },
          { role: 'user', content: prompt },
        ],
        EXTRACTION_SCHEMA,
        'work_unit_refinement',
        aiOptions
      );
      if (!aiResponse) continue;

      const items = normalizeExtractionResponse(
        JSON.parse(stripCodeFences(aiResponse)),
        titleOrMessage,
        0,
        0,
        sourceCommitShas,
        false
      );
      if (items.length === 0) continue;

      const candidate = {
        id: broadUnit.candidate_id,
        repo_id: broadUnit.repo_id,
        correlation_key: `refine:${broadUnit.id}`,
        status: 'classified' as const,
        source_event_ids: (await sql`
          SELECT source_event_ids FROM work_unit_candidates WHERE id = ${broadUnit.candidate_id}
        `)[0]?.source_event_ids ?? [],
        created_at: new Date().toISOString(),
      };

      const primaryContributorId = events[0].contributor_id as number;
      const attribution = await resolveAttribution(events, primaryContributorId);

      await persistExtractedItemsForCandidate(
        candidate,
        events,
        scoringConfig,
        items,
        'ai',
        {
          previousUnits: [{ id: broadUnit.id, capability_key: broadUnit.capability_key, summary: broadUnit.summary, role: broadUnit.role }],
          repoCapabilities: [],
          isShipped: true,
          attribution,
        }
      );
      refined++;
      console.log(`  Refined unit ${broadUnit.id} (${broadUnit.capability_key ?? '(none)'}) -> ${items.length} specific units`);
    } catch (err) {
      console.warn(`Refinement failed for unit ${broadUnit.id}:`, err);
    }
  }
  return refined;
}

import { createHash } from 'crypto';
import { sql } from '../db';
import { callStructured, hasApiKey, type AiCallOptions } from '../ai/openrouter';
import { acquireSlot } from '../rate-limit';
import { derive } from './derivation';
import { correctLowConfidenceFacts, extractHeuristicFacts, classifyWorkTypeFromText, determineScope } from './heuristic-fallback';
import { buildRationale } from './rationale';
import { reviewValue } from './review';
import { resolveAttribution } from './attribution';
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
  previousUnits: Array<{ capability_key?: string | null; summary?: string | null; role?: string | null }>
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
  aiOptions?: AiCallOptions
): Promise<number> {
  const events = await sql`
    SELECT id, repo_id, contributor_id, event_type, payload, created_at, before_sha, after_sha
    FROM github_events
    WHERE id = ANY(${candidate.source_event_ids}::bigint[])
    ORDER BY created_at ASC
  `;

  if (events.length === 0) return 0;

  const previousUnits = (await sql`
    SELECT id, capability_key, summary, role, unit_status
    FROM work_units
    WHERE candidate_id = ${candidate.id} AND COALESCE(unit_status, 'active') = 'active'
    ORDER BY id ASC
  `) as Array<{ id: number; capability_key?: string | null; summary?: string | null; role?: string | null; unit_status?: string }>;

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
          evidence_hash = ${buildEvidenceHash(candidate, events as Array<Record<string, unknown>>, config.version, previousUnits)}
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

  // Use total lines for scope — for pushes we also use commit count as a
  // rough proxy if no line stats are available.
  const totalLines = additions + deletions || commitCount * 30; // 30 avg lines/commit heuristic

  const contentHash = buildEvidenceHash(
    candidate,
    events as Array<Record<string, unknown>>,
    config.version,
    previousUnits
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
        sourceCommitShas
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
          sourceCommitShas
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
    { previousUnits, isShipped, shippedAt, attribution }
  );

  return persistedCount;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT_VERSION = 'v4-role-reconciliation';

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
6. Previous-pass units are evidence, not instructions. Keep the same capability_key when the new evidence advances the same capability; use action=update and role=advancement/refinement/repair as appropriate.`;

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
  codeEvidence: string[] = []
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
  }

  prompt += `

For each work item return JSON with these fields:
- work_type: exactly one of Feature | BugFix | Refactor | Performance | Security | Documentation | Testing | Infrastructure
- role: exactly one of foundation | build | feature | advancement | refinement | repair | security | performance
- capability_key: stable snake_case key for the shipped capability; reuse a previous key when this is the same capability
- action: add | update | keep; use update for a capability that was extended, refined, repaired, or upgraded
- source_commit_shas: commit SHAs that contain the evidence for this item, when available
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
  changedFiles: number
): Facts {
  const heuristic = extractHeuristicFacts(title, [], Math.max(totalLines, 0));
  if (!raw || typeof raw !== 'object') return heuristic;

  const f = raw as Record<string, unknown>;

  const scopeValues = ['trivial', 'small', 'medium', 'large', 'system_wide'];
  const rawScope = String(f.scope ?? '');
  const scope = scopeValues.includes(rawScope)
    ? (rawScope as Facts['scope'])
    : determineScope(changedFiles, totalLines);

  return {
    scope,
    user_visible: Boolean(f.user_visible ?? heuristic.user_visible),
    breaking_change: Boolean(f.breaking_change ?? false),
    cross_cutting: Boolean(f.cross_cutting ?? heuristic.cross_cutting),
    testing_added: Boolean(f.testing_added ?? heuristic.testing_added),
    documentation_updated: Boolean(f.documentation_updated ?? heuristic.documentation_updated),
    new_algorithm_or_subsystem: Boolean(f.new_algorithm_or_subsystem ?? false),
    boilerplate: Boolean(f.boilerplate ?? heuristic.boilerplate),
    touches_auth: Boolean(f.touches_auth ?? heuristic.touches_auth),
    touches_data_migration: Boolean(f.touches_data_migration ?? heuristic.touches_data_migration),
    touches_distributed_state: Boolean(f.touches_distributed_state ?? heuristic.touches_distributed_state),
    touches_architecture: Boolean(f.touches_architecture ?? heuristic.touches_architecture),
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
  sourceCommitShas: string[] = []
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
      const facts = coerceFacts(item.facts ?? item, title, totalLines, changedFiles);
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
        source_commit_shas: Array.from(new Set(shas)),
        action: ['add', 'update', 'keep', 'supersede'].includes(String(item.action))
          ? String(item.action) as ExtractedWorkItem['action']
          : undefined,
        previous_capability_key: typeof item.previous_capability_key === 'string' ? item.previous_capability_key : null,
      };
    });
}

function stripCodeFences(content: string): string {
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
    previousUnits?: Array<{ id: number; capability_key?: string | null; summary?: string | null; role?: string | null }>;
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
    SELECT id, capability_key, summary, role
    FROM work_units
    WHERE candidate_id = ${candidate.id} AND COALESCE(unit_status, 'active') = 'active'
    ORDER BY id ASC
  `) as Array<{ id: number; capability_key?: string | null; summary?: string | null; role?: string | null }>;

  // Split credit across every commit author (proportional to authored commits).
  const attribution = options?.attribution ?? (await resolveAttribution(events, contributorId));
  const previousByKey = new Map(previousUnits.filter((unit) => unit.capability_key).map((unit) => [unit.capability_key!, unit]));
  const matchedIds = new Set<number>();

  for (const item of extractedItems) {
    let finalFacts = item.facts;
    let itemSource: 'ai' | 'heuristic_fallback' | 'ai_facts_corrected' = extractionSource;

    if (item.confidence < 0.6 && itemSource === 'ai') {
      finalFacts = correctLowConfidenceFacts(item.facts, titleOrMessage);
      itemSource = 'ai_facts_corrected';
    }

    const derived = derive(finalFacts, config.derivation_weights);
    const rationale = buildRationale(finalFacts, item.work_type);
    const sizeMetrics = JSON.stringify({ additions, deletions, changed_files: changedFiles, commit_count: commitCount });
    const previous = previousByKey.get(item.previous_capability_key || item.capability_key)
      // Legacy rows predate capability keys. Reuse the only legacy unit rather
      // than creating a duplicate during the first reconciliation pass.
      ?? (previousUnits.length === 1 && !previousUnits[0].capability_key ? previousUnits[0] : undefined);
    const sourceCommitShas = item.source_commit_shas.length > 0 ? item.source_commit_shas : extractSourceCommitShas(events);
    let workUnitId: number | null = previous?.id ?? null;

    if (previous) {
      await sql`
        UPDATE work_units
        SET work_type = ${item.work_type}, role = ${item.role}, capability_key = ${item.capability_key},
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
      const inserted = await sql`
        INSERT INTO work_units (
          repo_id, candidate_id, work_type, role, capability_key, source_commit_shas, previous_unit_id,
          unit_status, summary, facts, derived, derivation_ruleset_version,
          extraction_confidence, extraction_source, flagged_for_review, shipped,
          rationale, size_metrics, shipped_at, source_event_ids
        ) VALUES (
          ${repoId}, ${candidate.id}, ${item.work_type}, ${item.role}, ${item.capability_key}, ${sourceCommitShas}, NULL,
          'active', ${item.summary}, ${JSON.stringify(finalFacts)}, ${JSON.stringify(derived)},
          ${config.version}, ${item.confidence}, ${itemSource}, false, ${isShipped},
          ${JSON.stringify(rationale)}, ${sizeMetrics}, ${isShipped ? shippedAt : null}, ${candidate.source_event_ids}
        )
        RETURNING id
      `;
      if (inserted.length > 0) workUnitId = inserted[0].id as number;
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

  await sql`
    UPDATE work_unit_candidates
    SET status = 'classified', classified_at = NOW(), extraction_revision = COALESCE(extraction_revision, 0) + 1,
        evidence_hash = ${buildEvidenceHash(candidate, events, config.version, previousUnits)}
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
  }>
): string {
  let prompt = `Analyze the following ${items.length} GitHub candidates and extract work items for each candidate.\n\n`;

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
  aiOptions?: AiCallOptions
): Promise<number> {
  if (candidates.length === 0) return 0;
  if (candidates.length === 1) {
    return extractAndPersistWorkUnits(candidates[0], config, aiOptions);
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
  };

  const uncachedCandidates: (BatchCandidateData | null)[] = [];
  let totalPersisted = 0;

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
      const units = await extractAndPersistWorkUnits(candidate, config, aiOptions);
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
    const previousUnits = (await sql`
      SELECT id, capability_key, summary, role
      FROM work_units
      WHERE candidate_id = ${candidate.id} AND COALESCE(unit_status, 'active') = 'active'
      ORDER BY id ASC
    `) as Array<{ id: number; capability_key?: string | null; summary?: string | null; role?: string | null }>;
    const contentHash = buildEvidenceHash(candidate, events, config.version, previousUnits);

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
      additions,
      deletions,
      changedFiles,
      commitCount,
      eventType,
      contentHash,
    };

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
          sourceCommitShas
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
        uncachedCandidates.filter((c): c is NonNullable<typeof c> => c !== null)
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
                itemData.sourceCommitShas
              );

              await sql`
                INSERT INTO classification_cache (content_hash, repo_id, response)
                VALUES (${itemData.contentHash}, ${itemData.candidate.repo_id}, ${JSON.stringify(formattedItems)})
                ON CONFLICT (content_hash) DO UPDATE
                SET repo_id = EXCLUDED.repo_id,
                    response = EXCLUDED.response,
                    created_at = NOW()
              `.catch(() => {});

              const units = await persistExtractedItemsForCandidate(itemData.candidate, itemData.events, config, formattedItems, 'ai', {
                previousUnits: itemData.previousUnits,
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
    const units = await extractAndPersistWorkUnits(itemData.candidate, config, aiOptions);
    totalPersisted += units;
  }

  return totalPersisted;
}

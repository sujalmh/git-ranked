import { createHash } from 'crypto';
import { sql } from '../db';
import { callStructured, hasApiKey, type AiCallOptions } from '../ai/openrouter';
import { acquireSlot } from '../rate-limit';
import { derive } from './derivation';
import { correctLowConfidenceFacts, extractHeuristicFacts, classifyWorkTypeFromText, determineScope } from './heuristic-fallback';
import { buildRationale } from './rationale';
import { reviewValue } from './review';
import type { Facts, ReviewFacts, ScoringConfig, WorkType } from './types';
import type { WorkUnitCandidate } from './aggregator';

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
    const commitCount =
      typeof payload.commit_count === 'number'
        ? payload.commit_count
        : Array.isArray(payload.commits)
          ? payload.commits.length
          : 0;

    bestAdditions = Math.max(bestAdditions, additions);
    bestDeletions = Math.max(bestDeletions, deletions);
    bestChangedFiles = Math.max(bestChangedFiles, changedFiles);
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

  // Delete any previously generated work_units for this candidate so re-runs
  // don't produce duplicate rows.
  await sql`
    DELETE FROM work_units WHERE candidate_id = ${candidate.id}
  `;

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

    const inserted = await sql`
      INSERT INTO work_units (
        repo_id, candidate_id, work_type, summary, facts, derived, derivation_ruleset_version,
        extraction_confidence, extraction_source, flagged_for_review, shipped,
        rationale, size_metrics, shipped_at, source_event_ids
      ) VALUES (
        ${repoId}, ${candidate.id}, 'Review',
        ${reviewSummary},
        ${JSON.stringify(reviewFacts)}, ${JSON.stringify(derived)},
        ${config.version}, 1.0, 'heuristic_fallback', false, true,
        ${JSON.stringify(rationale)}, NULL,
        ${firstEvent.created_at as string}, ${candidate.source_event_ids}
      )
      RETURNING id
    `;

    if (inserted.length > 0) {
      await sql`
        INSERT INTO work_unit_contributors (work_unit_id, contributor_id, attribution_weight)
        VALUES (${inserted[0].id as number}, ${contributorId}, 1.0)
        ON CONFLICT DO NOTHING
      `;
    }

    await sql`
      UPDATE work_unit_candidates
      SET status = 'classified', classified_at = NOW()
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
  const { additions, deletions, changedFiles, commitCount } =
    extractMergedSizeMetrics(events as Array<Record<string, unknown>>);

  // Use total lines for scope — for pushes we also use commit count as a
  // rough proxy if no line stats are available.
  const totalLines = additions + deletions || commitCount * 30; // 30 avg lines/commit heuristic

  // Include prompt version in hash so prompt improvements invalidate the cache
  const contentToHash = `${candidate.correlation_key}:${titleOrMessage}:${config.version}:${EXTRACTION_PROMPT_VERSION}`;
  const contentHash = createHash('sha256').update(contentToHash).digest('hex');

  let extractedItems: Array<{
    work_type: WorkType;
    summary: string;
    facts: Facts;
    confidence: number;
  }> = [];

  let extractionSource: 'ai' | 'heuristic_fallback' | 'ai_facts_corrected' = 'heuristic_fallback';

  // ── Check classification cache ────────────────────────────────────────────
  const cacheHit = await sql`
    SELECT response FROM classification_cache WHERE content_hash = ${contentHash}
  `;

  if (cacheHit.length > 0) {
    try {
      const parsed = cacheHit[0].response as typeof extractedItems;
      if (Array.isArray(parsed) && parsed.length > 0) {
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
        prBody
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
        const parsed = JSON.parse(stripCodeFences(aiResponse));
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          // Validate and coerce each item
          extractedItems = parsed.items
            .filter((item: unknown) => item && typeof item === 'object')
            .map((item: Record<string, unknown>) => ({
              work_type: coerceWorkType(String(item.work_type ?? 'Feature')),
              summary: String(item.summary ?? titleOrMessage).slice(0, 200),
              facts: coerceFacts(item.facts, titleOrMessage, totalLines, changedFiles),
              confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0.7))),
            }));

          if (extractedItems.length > 0) {
            extractionSource = 'ai';
            await sql`
              INSERT INTO classification_cache (content_hash, response)
              VALUES (${contentHash}, ${JSON.stringify(extractedItems)})
              ON CONFLICT (content_hash) DO NOTHING
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
    const heuristicFacts = extractHeuristicFacts(titleOrMessage, [], additions, deletions);

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
        summary: fallbackSummary,
        facts: heuristicFacts,
        confidence: 0.5,
      },
    ];
    extractionSource = 'heuristic_fallback';
  }

  // ── Persist work units ────────────────────────────────────────────────────
  let persistedCount = 0;
  const isShipped =
    eventType === 'pr_merged' || eventType === 'push' || eventType === 'issue_closed';

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

    const inserted = await sql`
      INSERT INTO work_units (
        repo_id, candidate_id, work_type, summary, facts, derived, derivation_ruleset_version,
        extraction_confidence, extraction_source, flagged_for_review, shipped,
        rationale, size_metrics, shipped_at, source_event_ids
      ) VALUES (
        ${repoId}, ${candidate.id}, ${item.work_type},
        ${item.summary},
        ${JSON.stringify(finalFacts)}, ${JSON.stringify(derived)},
        ${config.version}, ${item.confidence}, ${itemSource}, false, ${isShipped},
        ${JSON.stringify(rationale)}, ${sizeMetrics},
        ${isShipped ? (firstEvent.created_at as string) : null},
        ${candidate.source_event_ids}
      )
      RETURNING id
    `;

    if (inserted.length > 0) {
      await sql`
        INSERT INTO work_unit_contributors (work_unit_id, contributor_id, attribution_weight)
        VALUES (${inserted[0].id as number}, ${contributorId}, 1.0)
        ON CONFLICT DO NOTHING
      `;
      persistedCount++;
    }
  }

  await sql`
    UPDATE work_unit_candidates
    SET status = 'classified', classified_at = NOW()
    WHERE id = ${candidate.id}
  `;

  return persistedCount;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT_VERSION = 'v3';

export const EXTRACTION_SYSTEM_MESSAGE = `You are an expert engineering work classifier for a GitHub repository analytics platform called GitRanked. Your job is to analyze GitHub events (pull requests, pushes, issues) and extract distinct, specific work items describing what was actually accomplished.

Critical classification rules:
1. Each summary MUST be SPECIFIC and DESCRIPTIVE — mention actual components, APIs, files, systems, or features modified.
2. Never output generic summaries like "Small scope feature", "Updated code", "Refactored files", "Fixed bug".
3. Work Types: Choose exactly ONE from [Feature, BugFix, Refactor, Performance, Security, Documentation, Testing, Infrastructure].
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
5. If a single commit/PR covers multiple distinct architectural items, split into 1-3 distinct work items.`;

export function buildExtractionPrompt(
  title: string,
  eventType: string,
  changedFiles: number,
  additions: number,
  deletions: number,
  commitCount: number,
  commitMessages: string[],
  prBody: string | null
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

  let prompt = `Analyze this GitHub ${eventLabel} and extract 1-3 distinct work items.

Title: "${title}"
Event type: ${eventType}
Stats: ${changedFiles} files changed, +${additions}/-${deletions} lines${commitCount > 1 ? `, ${commitCount} commits` : ''}
`;

  if (commitMessages.length > 0) {
    const limited = commitMessages.slice(0, 15);
    prompt += `\nCommit messages:\n${limited.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n`;
  }

  if (prBody) {
    prompt += `\nPR description:\n${prBody.slice(0, 1200)}\n`;
  }

  prompt += `

For each work item return JSON with these fields:
- work_type: exactly one of Feature | BugFix | Refactor | Performance | Security | Documentation | Testing | Infrastructure
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
      "summary": "Add RBAC models with role-based permission system and database migrations",
      "facts": { "scope": "medium", "user_visible": false, "breaking_change": false, "cross_cutting": true, "testing_added": false, "documentation_updated": false, "new_algorithm_or_subsystem": true, "boilerplate": false, "touches_auth": true, "touches_data_migration": true, "touches_distributed_state": false, "touches_architecture": true },
      "confidence": 0.85
    }
  ]
}

Respond with JSON: { "items": [...] }`;

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
  extractedItems: Array<{
    work_type: WorkType;
    summary: string;
    facts: Facts;
    confidence: number;
  }>,
  extractionSource: 'ai' | 'heuristic_fallback' | 'ai_facts_corrected' = 'heuristic_fallback'
): Promise<number> {
  if (events.length === 0 || extractedItems.length === 0) return 0;

  const firstEvent = events[0];
  const repoId = candidate.repo_id;
  const contributorId = firstEvent.contributor_id as number;
  const eventType = String(firstEvent.event_type || '');

  const titleOrMessage = extractBestTitle(events, eventType);
  const { additions, deletions, changedFiles, commitCount } = extractMergedSizeMetrics(events);

  let persistedCount = 0;
  const isShipped = eventType === 'pr_merged' || eventType === 'push' || eventType === 'issue_closed';

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

    const inserted = await sql`
      INSERT INTO work_units (
        repo_id, candidate_id, work_type, summary, facts, derived, derivation_ruleset_version,
        extraction_confidence, extraction_source, flagged_for_review, shipped,
        rationale, size_metrics, shipped_at, source_event_ids
      ) VALUES (
        ${repoId}, ${candidate.id}, ${item.work_type},
        ${item.summary},
        ${JSON.stringify(finalFacts)}, ${JSON.stringify(derived)},
        ${config.version}, ${item.confidence}, ${itemSource}, false, ${isShipped},
        ${JSON.stringify(rationale)}, ${sizeMetrics},
        ${isShipped ? (firstEvent.created_at as string) : null},
        ${candidate.source_event_ids}
      )
      RETURNING id
    `;

    if (inserted.length > 0) {
      await sql`
        INSERT INTO work_unit_contributors (work_unit_id, contributor_id, attribution_weight)
        VALUES (${inserted[0].id as number}, ${contributorId}, 1.0)
        ON CONFLICT DO NOTHING
      `;
      persistedCount++;
    }
  }

  await sql`
    UPDATE work_unit_candidates
    SET status = 'classified', classified_at = NOW()
    WHERE id = ${candidate.id}
  `;

  return persistedCount;
}

export const BATCH_EXTRACTION_SYSTEM_MESSAGE = `You are an expert engineering work classifier for GitRanked. Your job is to analyze multiple GitHub candidates in a single request and extract distinct, specific work items for each candidate.

Critical rules:
1. Return JSON containing a "candidates" array matching each candidate by correlation_key.
2. Each summary MUST be SPECIFIC and DESCRIPTIVE — mention the actual components, files, or technologies involved.
3. For each candidate, return 1-3 items with work_type, summary, facts, and confidence score.`;

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

    await sql`DELETE FROM work_units WHERE candidate_id = ${candidate.id}`;

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
    const { additions, deletions, changedFiles, commitCount } = extractMergedSizeMetrics(events);

    const contentToHash = `${candidate.correlation_key}:${titleOrMessage}:${config.version}:${EXTRACTION_PROMPT_VERSION}`;
    const contentHash = createHash('sha256').update(contentToHash).digest('hex');

    const itemData = {
      candidate,
      events,
      titleOrMessage,
      commitMessages,
      prBody,
      additions,
      deletions,
      changedFiles,
      commitCount,
      eventType,
      contentHash,
    };

    const cacheHit = await sql`
      SELECT response FROM classification_cache WHERE content_hash = ${contentHash}
    `;

    if (cacheHit.length > 0) {
      try {
        const parsed = cacheHit[0].response;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const units = await persistExtractedItemsForCandidate(candidate, events, config, parsed, 'ai');
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
              const formattedItems = items.map((item: Record<string, unknown>) => ({
                work_type: coerceWorkType(String(item.work_type ?? 'Feature')),
                summary: String(item.summary ?? itemData.titleOrMessage).slice(0, 200),
                facts: coerceFacts(item.facts, itemData.titleOrMessage, itemData.additions + itemData.deletions, itemData.changedFiles),
                confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0.7))),
              }));

              await sql`
                INSERT INTO classification_cache (content_hash, response)
                VALUES (${itemData.contentHash}, ${JSON.stringify(formattedItems)})
                ON CONFLICT (content_hash) DO NOTHING
              `.catch(() => {});

              const units = await persistExtractedItemsForCandidate(itemData.candidate, itemData.events, config, formattedItems, 'ai');
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

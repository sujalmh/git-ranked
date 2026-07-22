import { createHash } from 'crypto';
import { sql } from '../db';
import { callStructured, hasApiKey } from '../ai/openrouter';
import { derive } from './derivation';
import { correctLowConfidenceFacts, extractHeuristicFacts, classifyWorkTypeFromText, determineScope } from './heuristic-fallback';
import { buildRationale } from './rationale';
import { reviewValue } from './review';
import type { Facts, ReviewFacts, ScoringConfig, WorkType } from './types';
import type { WorkUnitCandidate } from './aggregator';

/**
 * Parse the `size_metrics` out of a push event payload.
 * Push events store an array of commits; we sum their additions/deletions
 * if present, otherwise we fall back to top-level payload fields.
 */
function parseSizeMetricsFromPayload(
  eventType: string,
  payload: Record<string, unknown>
): { additions: number; deletions: number; changedFiles: number; commitCount: number } {
  // Direct fields (present on pr_merged events with detail fetch)
  const directAdditions = typeof payload.additions === 'number' ? payload.additions : 0;
  const directDeletions = typeof payload.deletions === 'number' ? payload.deletions : 0;
  const directChangedFiles = typeof payload.changed_files === 'number' ? payload.changed_files : 0;

  if (eventType === 'push') {
    // Push payloads have a `commits` array; each commit may have stats.
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    const commitCount = typeof payload.commit_count === 'number' ? payload.commit_count : commits.length;

    let sumAdditions = 0;
    let sumDeletions = 0;
    for (const c of commits) {
      if (c && typeof c === 'object') {
        const co = c as Record<string, unknown>;
        sumAdditions += typeof co.additions === 'number' ? co.additions : 0;
        sumDeletions += typeof co.deletions === 'number' ? co.deletions : 0;
      }
    }

    return {
      additions: sumAdditions || directAdditions,
      deletions: sumDeletions || directDeletions,
      changedFiles: directChangedFiles,
      commitCount,
    };
  }

  return {
    additions: directAdditions,
    deletions: directDeletions,
    changedFiles: directChangedFiles,
    commitCount: 1,
  };
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
  config: ScoringConfig
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

    const inserted = await sql`
      INSERT INTO work_units (
        repo_id, candidate_id, work_type, facts, derived, derivation_ruleset_version,
        extraction_confidence, extraction_source, flagged_for_review, shipped,
        rationale, size_metrics, shipped_at, source_event_ids
      ) VALUES (
        ${repoId}, ${candidate.id}, 'Review',
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
  const titleOrMessage = String(
    payload.title || payload.message || eventType
  );

  const { additions, deletions, changedFiles, commitCount } =
    parseSizeMetricsFromPayload(eventType, payload);

  // Use total lines for scope — for pushes we also use commit count as a
  // rough proxy if no line stats are available.
  const totalLines = additions + deletions || commitCount * 30; // 30 avg lines/commit heuristic

  const contentToHash = `${candidate.correlation_key}:${titleOrMessage}:${config.version}`;
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
  if (extractedItems.length === 0 && hasApiKey()) {
    try {
      const prompt = buildExtractionPrompt(
        titleOrMessage,
        eventType,
        changedFiles,
        additions,
        deletions,
        commitCount
      );

      const aiResponse = await callStructured(
        [{ role: 'user', content: prompt }],
        EXTRACTION_SCHEMA,
        'work_unit_extraction'
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

    extractedItems = [
      {
        work_type: workType,
        summary: titleOrMessage.slice(0, 200),
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
        repo_id, candidate_id, work_type, facts, derived, derivation_ruleset_version,
        extraction_confidence, extraction_source, flagged_for_review, shipped,
        rationale, size_metrics, shipped_at, source_event_ids
      ) VALUES (
        ${repoId}, ${candidate.id}, ${item.work_type},
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

function buildExtractionPrompt(
  title: string,
  eventType: string,
  changedFiles: number,
  additions: number,
  deletions: number,
  commitCount: number
): string {
  const eventLabel =
    eventType === 'pr_merged'
      ? 'pull request'
      : eventType === 'push'
        ? 'push/commit'
        : eventType === 'issue_closed'
          ? 'closed issue'
          : eventType;

  return `You are an engineering work classifier. Analyze this GitHub ${eventLabel} and extract 1-3 distinct work items.

Title/Message: "${title}"
Event type: ${eventType}
Stats: ${changedFiles} files changed, +${additions}/-${deletions} lines${commitCount > 1 ? `, ${commitCount} commits` : ''}

For each work item return:
- work_type: exactly one of Feature | BugFix | Refactor | Performance | Security | Documentation | Testing | Infrastructure
- summary: concise one-line description of what was done (max 150 chars)
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
- confidence: 0.0-1.0

Scope guidance:
- trivial: ≤2 files, ≤20 lines
- small: ≤5 files, ≤100 lines  
- medium: ≤15 files, ≤400 lines
- large: ≤35 files, ≤1000 lines
- system_wide: 35+ files or 1000+ lines

Respond with JSON: { "items": [...] }`;
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          work_type: { type: 'string' },
          summary: { type: 'string' },
          facts: { type: 'object' },
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

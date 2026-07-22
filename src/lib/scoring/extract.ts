import { createHash } from 'crypto';
import { sql } from '../db';
import { callStructured, hasApiKey } from '../ai/openrouter';
import { derive } from './derivation';
import { WorkUnitExtractionResponseSchema } from './facts';
import { correctLowConfidenceFacts, extractHeuristicFacts } from './heuristic-fallback';
import { buildRationale } from './rationale';
import { reviewValue } from './review';
import type { Facts, ReviewFacts, ScoringConfig, WorkType } from './types';
import type { WorkUnitCandidate } from './aggregator';

export async function extractAndPersistWorkUnits(
  candidate: WorkUnitCandidate,
  config: ScoringConfig
): Promise<number> {
  const events = await sql`
    SELECT id, repo_id, contributor_id, event_type, payload, created_at, before_sha, after_sha
    FROM github_events
    WHERE id = ANY(${candidate.source_event_ids}::bigint[])
  `;

  if (events.length === 0) return 0;

  const firstEvent = events[0];
  const repoId = candidate.repo_id;
  const contributorId = firstEvent.contributor_id;
  const eventType = firstEvent.event_type;
  const payload = (firstEvent.payload || {}) as Record<string, unknown>;

  // Handle Review candidates directly
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

    const blockingIssueFound = state === 'changes_requested' || /\b(bug|issue|fix|blocking|problem|error)\b/i.test(body);
    const confirmedValid = blockingIssueFound; // default initial state

    const reviewFacts: ReviewFacts = {
      substantiveness,
      blocking_issue_found: blockingIssueFound,
      confirmed_valid: confirmedValid,
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
        extraction_confidence, extraction_source, flagged_for_review, shipped, rationale,
        shipped_at, source_event_ids
      ) VALUES (
        ${repoId}, ${candidate.id}, 'Review', ${JSON.stringify(reviewFacts)}, ${JSON.stringify(derived)},
        ${config.version}, 1.0, 'ai', false, true, ${JSON.stringify(rationale)},
        ${firstEvent.created_at}, ${candidate.source_event_ids}
      )
      RETURNING id
    `;

    if (inserted.length > 0) {
      await sql`
        INSERT INTO work_unit_contributors (work_unit_id, contributor_id, attribution_weight)
        VALUES (${inserted[0].id}, ${contributorId}, 1.0)
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

  // Handle PR, Push, Issue work unit extraction
  const titleOrMessage = String(payload.title || payload.message || firstEvent.event_type);
  const additions = typeof payload.additions === 'number' ? payload.additions : 0;
  const deletions = typeof payload.deletions === 'number' ? payload.deletions : 0;
  const changedFiles = typeof payload.changed_files === 'number' ? payload.changed_files : 0;

  const contentToHash = `${candidate.correlation_key}:${titleOrMessage}:${config.version}`;
  const contentHash = createHash('sha256').update(contentToHash).digest('hex');

  let extractedItems: Array<{
    work_type: WorkType;
    summary: string;
    facts: Facts;
    confidence: number;
  }> = [];

  let extractionSource: 'ai' | 'heuristic_fallback' | 'ai_facts_corrected' = 'heuristic_fallback';

  // Check cache first
  const cacheHit = await sql`
    SELECT response FROM classification_cache WHERE content_hash = ${contentHash}
  `;

  if (cacheHit.length > 0) {
    try {
      extractedItems = cacheHit[0].response as typeof extractedItems;
      extractionSource = 'ai';
    } catch {
      /* fallback */
    }
  }

  if (extractedItems.length === 0 && hasApiKey()) {
    try {
      const prompt = `Segment this pull request/push candidate into 1-N work items.
Title/Message: "${titleOrMessage}"
Changed Files: ${changedFiles}, Additions: +${additions}, Deletions: -${deletions}

For each work item, provide:
1. work_type: Feature | BugFix | Refactor | Performance | Security | Documentation | Testing | Infrastructure
2. summary: short description of work done
3. facts: object with scope (trivial|small|medium|large|system_wide), user_visible, breaking_change, cross_cutting, testing_added, documentation_updated, new_algorithm_or_subsystem, boilerplate, touches_auth, touches_data_migration, touches_distributed_state, touches_architecture.
4. confidence: 0.0 to 1.0 certainty level.`;

      const aiResponse = await callStructured(
        [{ role: 'user', content: prompt }],
        {
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
              },
            },
          },
        },
        'work_unit_extraction'
      );

      if (aiResponse) {
        const parsed = JSON.parse(aiResponse);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          extractedItems = parsed.items;
          extractionSource = 'ai';

          await sql`
            INSERT INTO classification_cache (content_hash, response)
            VALUES (${contentHash}, ${JSON.stringify(extractedItems)})
            ON CONFLICT (content_hash) DO NOTHING
          `.catch(() => {});
        }
      }
    } catch (err) {
      console.warn('AI extraction failed, falling back to heuristics:', err);
    }
  }

  // If no AI key or extraction failed, fallback to heuristic extraction
  if (extractedItems.length === 0) {
    const heuristicFacts = extractHeuristicFacts(titleOrMessage, [], additions, deletions);
    const workType: WorkType = eventType === 'pr_merged' ? 'Feature' : 'Refactor';
    extractedItems = [
      {
        work_type: workType,
        summary: titleOrMessage.slice(0, 100),
        facts: heuristicFacts,
        confidence: 0.5,
      },
    ];
    extractionSource = 'heuristic_fallback';
  }

  let persistedCount = 0;

  for (const item of extractedItems) {
    let finalFacts = item.facts;
    let itemSource: 'ai' | 'heuristic_fallback' | 'ai_facts_corrected' = extractionSource;

    if (item.confidence < 0.6 && itemSource === 'ai') {
      finalFacts = correctLowConfidenceFacts(item.facts, titleOrMessage);
      itemSource = 'ai_facts_corrected';
    }

    const derived = derive(finalFacts, config.derivation_weights);
    const rationale = buildRationale(finalFacts, item.work_type);
    const isShipped = eventType === 'pr_merged' || eventType === 'push' || eventType === 'issue_closed';

    const inserted = await sql`
      INSERT INTO work_units (
        repo_id, candidate_id, work_type, facts, derived, derivation_ruleset_version,
        extraction_confidence, extraction_source, flagged_for_review, shipped, rationale,
        size_metrics, shipped_at, source_event_ids
      ) VALUES (
        ${repoId}, ${candidate.id}, ${item.work_type}, ${JSON.stringify(finalFacts)}, ${JSON.stringify(derived)},
        ${config.version}, ${item.confidence}, ${itemSource}, false, ${isShipped},
        ${JSON.stringify(rationale)}, ${JSON.stringify({ additions, deletions, changed_files: changedFiles })},
        ${isShipped ? firstEvent.created_at : null}, ${candidate.source_event_ids}
      )
      RETURNING id
    `;

    if (inserted.length > 0) {
      await sql`
        INSERT INTO work_unit_contributors (work_unit_id, contributor_id, attribution_weight)
        VALUES (${inserted[0].id}, ${contributorId}, 1.0)
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

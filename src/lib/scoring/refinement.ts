/**
 * Granularity refinement — the feed-backward quality job.
 *
 * Work-unit extraction is feed-forward: each candidate produces units, and an
 * over-broad unit (e.g. one "backend" unit that actually shipped several
 * capabilities) persists and propagates. This module closes the loop:
 *
 *   1. AUDIT (deterministic, cheap) — flag only precise signals: roll-up
 *      summaries, heuristic-source units with multi-file evidence, and
 *      low-confidence units with multi-file evidence.
 *   2. QUEUE — flagged units go into `work_unit_refinements` (deduped, budgeted).
 *   3. REFINE (targeted, batched) — each flagged unit is split into specific
 *      units. Split boundaries are pre-computed deterministically from the
 *      candidate's changed file paths when available (the model only names each
 *      cluster); otherwise the model enumerates distinct capabilities from the
 *      evidence. The parent is superseded and children are chained.
 *   4. CREDIT-CONSERVING RE-ATTRIBUTION — a split never increases any
 *      contributor's total credit. Children are credited from commit evidence
 *      when it exists; otherwise the parent's weights are sliced evenly across
 *      children, and a hard cap enforces `sum(child weights) <= parent weight`.
 *
 * Convergence: splitting is monotonic, `refinement_depth` is capped, a model
 * "this is one capability" answer marks the unit `audited` permanently, and a
 * per-run budget bounds total spend. The goal tree is never rebuilt here.
 */

import { sql } from '../db';
import { callStructured, hasApiKey, type AiCallOptions } from '../ai/openrouter';
import { acquireSlot } from '../rate-limit';
import { derive } from './derivation';
import { buildRationale } from './rationale';
import { isBroadWorkUnit, stripCodeFences } from './extract';
import {
  clampCentrality,
  loadRepoGoalTree,
  upsertCapabilityLedgerRow,
  formatGoalTreeBlock,
} from './goals';
import type { ScoringConfig, WorkUnit, Facts } from './types';

/** The refinement schema's facts are free-form JSON; coerce to Facts for derive(). */
function coerceFacts(raw: Record<string, unknown>): Facts {
  return raw as unknown as Facts;
}

export const MAX_REFINE_DEPTH = 3;
export const AUDIT_MULTI_FILE_THRESHOLD = 5;
export const REFINE_BATCH_SIZE = 6;
export const PER_RUN_BUDGET = 20;

// ── Deterministic clustering ─────────────────────────────────────────────────

/** Number of shared leading path segments between two directory paths. */
export function commonDirDepth(a: string, b: string): number {
  const sa = a.split('/');
  const sb = b.split('/');
  let n = 0;
  while (n < sa.length && n < sb.length && sa[n] === sb[n]) n++;
  return n;
}

/** The shared leading path segments of two directory paths. */
export function commonDir(a: string, b: string): string {
  const out: string[] = [];
  const sa = a.split('/');
  const sb = b.split('/');
  for (let i = 0; i < sa.length && i < sb.length && sa[i] === sb[i]; i++) out.push(sa[i]);
  return out.join('/') || '(root)';
}

/**
 * Deterministic clustering of changed file paths into capability-sized groups.
 * Files are grouped by directory, then adjacent directories are merged by
 * longest common path prefix until the cluster count is within bounds. Used to
 * pre-decide the split so the model only has to name each part.
 */
export function clusterChangedFiles(filePaths: string[], maxClusters = 6): string[][] {
  if (filePaths.length === 0) return [];
  const byDir = new Map<string, string[]>();
  for (const f of filePaths) {
    const idx = f.lastIndexOf('/');
    const dir = idx > 0 ? f.slice(0, idx) : '(root)';
    const list = byDir.get(dir) ?? [];
    list.push(f);
    byDir.set(dir, list);
  }
  const clusters = Array.from(byDir.entries()).map(([dir, files]) => ({ dir, files }));
  while (clusters.length > maxClusters) {
    let bestI = -1;
    let bestJ = -1;
    let bestDepth = -1;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const depth = commonDirDepth(clusters[i].dir, clusters[j].dir);
        if (depth > bestDepth) {
          bestDepth = depth;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0) break;
    const a = clusters[bestI];
    const b = clusters[bestJ];
    const merged = {
      dir: commonDir(a.dir, b.dir),
      files: [...a.files, ...b.files],
    };
    clusters.splice(bestJ, 1);
    clusters.splice(bestI, 1, merged);
  }
  return clusters
    .map((c) => [...c.files].sort())
    .sort((x, y) => x[0].localeCompare(y[0]));
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface AuditRow {
  id: number;
  candidate_id: number;
  summary: string | null;
  facts: Record<string, unknown> | null;
  size_metrics: { changed_files?: number | null } | null;
  extraction_source: string | null;
  extraction_confidence: number | null;
  refinement_depth: number;
  audited: boolean;
}

/**
 * Precise, deterministic granularity audit. Flags only high-confidence signals
 * so refinement spend stays bounded; misses are cheaper than false positives.
 */
export function auditUnitGranularity(unit: AuditRow): string[] {
  if (unit.audited) return [];
  if ((unit.refinement_depth ?? 0) >= MAX_REFINE_DEPTH) return [];
  const reasons: string[] = [];

  if (isBroadWorkUnit({ summary: unit.summary, facts: unit.facts, size_metrics: unit.size_metrics })) {
    reasons.push('roll_up');
  }

  const changedFiles = Number(unit.size_metrics?.changed_files ?? 0);
  const multiFile = changedFiles >= AUDIT_MULTI_FILE_THRESHOLD;
  if (unit.extraction_source === 'heuristic_fallback' && multiFile) {
    reasons.push('heuristic_multi_file');
  }
  if (unit.extraction_confidence !== null && unit.extraction_confidence < 0.4 && multiFile) {
    reasons.push('low_confidence_multi_file');
  }

  return reasons;
}

// ── Credit-conserving re-attribution ─────────────────────────────────────────

export interface ChildAttributionInput {
  /** Contributors with commit-level evidence for this child (may be empty). */
  evidenceContributors: number[];
}

/**
 * Compute per-child attribution weights such that no contributor's TOTAL credit
 * across the children exceeds their original weight on the parent.
 *
 * - Children WITH commit evidence are credited to the evidence contributors
 *   (normalized).
 * - If ANY child has evidence, children WITHOUT evidence get NO credit (they
 *   exist as capability nodes but are unattributed until evidence exists) — so
 *   a contributor is never tagged on a sub-part they have no evidence for.
 * - If NO child has evidence, the parent's weights are even-sliced across all
 *   children to preserve the contributor's credit rather than dropping it.
 *
 * A hard cap enforces conservation, so a split can never inflate anyone's
 * credit.
 */
export function computeConservingWeights(
  parentWeights: Map<number, number>,
  children: ChildAttributionInput[]
): Array<Map<number, number>> {
  const numChildren = Math.max(1, children.length);
  const hasAnyEvidence = children.some((child) => (child.evidenceContributors ?? []).length > 0);

  const raw: Array<Map<number, number>> = children.map((child) => {
    const evidence = child.evidenceContributors ?? [];
    if (evidence.length > 0) {
      const counts = new Map<number, number>();
      for (const cid of evidence) counts.set(cid, (counts.get(cid) ?? 0) + 1);
      const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
      if (total > 0) {
        const m = new Map<number, number>();
        for (const [cid, count] of counts) m.set(cid, count / total);
        return m;
      }
    }
    if (hasAnyEvidence) {
      // No evidence for this child but evidence exists elsewhere: leave it
      // unattributed so we never mis-tag a contributor on a part they may not
      // have built.
      return new Map<number, number>();
    }
    const m = new Map<number, number>();
    for (const [cid, weight] of parentWeights) m.set(cid, weight / numChildren);
    return m;
  });

  // Conservation cap: total across children <= parent weight per contributor.
  const totals = new Map<number, number>();
  for (const m of raw) {
    for (const [cid, weight] of m) totals.set(cid, (totals.get(cid) ?? 0) + weight);
  }
  for (const [cid, total] of totals) {
    const cap = parentWeights.get(cid);
    if (cap !== undefined && total > cap + 1e-9) {
      const scale = cap / total;
      for (const m of raw) {
        if (m.has(cid)) m.set(cid, m.get(cid)! * scale);
      }
    }
  }
  return raw;
}

// ── Refinement prompt ─────────────────────────────────────────────────────────

interface RefineItem {
  cluster_index?: number;
  work_type: string;
  role: string;
  capability_key: string;
  summary: string;
  facts: Record<string, unknown>;
  confidence: number;
  source_commit_shas: string[];
}

interface RefineUnitResponse {
  unit_id: number;
  single?: boolean;
  items: RefineItem[];
}

export const REFINE_SYSTEM_MESSAGE = `You are refining over-broad work units in a GitHub analytics platform. A previous extraction collapsed a change that actually shipped SEVERAL distinct capabilities into ONE broad unit. Your job is to split it into specific capability units.

Rules:
- Each item must name a concrete component, API, subsystem, or feature (never generic summaries like "backend work", "refactored files", "updated code").
- When the change is provided as FILE CLUSTERS, return exactly one item per cluster and name that cluster's capability.
- When no clusters are given, enumerate every distinct shipped capability (2-12); do not preserve the collapsed unit.
- Reuse an existing repository capability_key (from the goals block) when an item matches one; mint a new key only for genuinely new capabilities.
- If the change genuinely describes a SINGLE capability, return exactly one item and set single=true.
- List source_commit_shas for each item when the commit messages allow you to tell which commits implement it.
- work_type: Feature | BugFix | Refactor | Performance | Security | Documentation | Testing | Infrastructure
- role: foundation | build | feature | advancement | refinement | repair | security | performance`;

export const REFINE_SCHEMA = {
  type: 'object',
  properties: {
    units: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          unit_id: { type: 'number' },
          single: { type: 'boolean' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                cluster_index: { type: 'number' },
                work_type: { type: 'string' },
                role: { type: 'string' },
                capability_key: { type: 'string' },
                summary: { type: 'string' },
                goal_alignment: { type: 'integer', minimum: 1, maximum: 5 },
                facts: {
                  type: 'object',
                  properties: {
                    scope: { type: 'string' },
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
                source_commit_shas: { type: 'array', items: { type: 'string' } },
              },
              required: ['work_type', 'summary', 'facts', 'confidence'],
            },
          },
        },
        required: ['unit_id', 'items'],
      },
    },
  },
  required: ['units'],
};

export function buildRefinePrompt(
  flagged: Array<{
    unit: { id: number; summary?: string | null; capability_key?: string | null; work_type?: string | null };
    title: string;
    commitMessages: string[];
    prBody: string | null;
    filePaths: string[];
    clusters: string[][];
  }>,
  goalTreeBlock: string
): string {
  let prompt = `Split the following over-broad work units into specific capability units.\n\n`;
  if (goalTreeBlock) {
    prompt += `Repository goals (reuse capability_key values that match an existing capability):\n${goalTreeBlock}\n\n`;
  }

  flagged.forEach((f, index) => {
    prompt += `--- BROAD UNIT ${index + 1} (unit_id: ${f.unit.id}) ---\n`;
    prompt += `Broad summary: "${f.unit.summary ?? '(none)'}"\n`;
    prompt += `Work type: ${f.unit.work_type ?? 'Feature'}\n`;
    prompt += `Title: "${f.title}"\n`;
    if (f.commitMessages.length > 0) {
      prompt += `Commit messages:\n${f.commitMessages.slice(0, 12).map((m, i) => `  ${i + 1}. ${m}`).join('\n')}\n`;
    }
    if (f.prBody) {
      prompt += `PR description:\n${f.prBody.slice(0, 600)}\n`;
    }
    if (f.filePaths.length > 0) {
      prompt += `Changed files:\n${f.filePaths.slice(0, 80).join('\n')}\n`;
    }
    if (f.clusters.length > 1) {
      prompt += `File clusters (name each cluster as one capability):\n${f.clusters
        .map((cluster, ci) => `  Cluster ${ci + 1}:\n${cluster.map((file) => `    - ${file}`).join('\n')}`)
        .join('\n')}\n`;
    } else if (f.clusters.length === 1) {
      prompt += `Changed files (single cluster):\n${f.clusters[0].map((file) => `  - ${file}`).join('\n')}\n`;
    }
    prompt += '\n';
  });

  prompt += `Return JSON: { "units": [ { "unit_id": <id>, "single": <bool>, "items": [ { "cluster_index": <n>, "work_type": "...", "role": "...", "capability_key": "...", "summary": "...", "facts": {...}, "confidence": 0.8, "source_commit_shas": [...] } ] } ] } for every unit above.`;
  return prompt;
}

// ── DB plumbing ───────────────────────────────────────────────────────────────

interface RefinementCandidateRow {
  id: number;
  work_unit_id: number;
  candidate_id: number;
  summary: string | null;
  capability_key: string | null;
  work_type: string;
  refinement_depth: number;
  reason: string;
  source_event_ids: number[];
}

async function loadRefinementCandidates(repoId: number, limit: number): Promise<RefinementCandidateRow[]> {
  return (await sql`
    SELECT wr.id, wr.work_unit_id, wu.candidate_id, wu.summary, wu.capability_key, wu.work_type,
           wu.refinement_depth, wr.reason, c.source_event_ids
    FROM work_unit_refinements wr
    JOIN work_units wu ON wu.id = wr.work_unit_id
    JOIN work_unit_candidates c ON c.id = wu.candidate_id
    WHERE wr.repo_id = ${repoId} AND wr.status = 'pending'
    ORDER BY wr.id ASC
    LIMIT ${limit}
  `) as unknown as RefinementCandidateRow[];
}

async function markRefinement(refinementId: number, status: string): Promise<void> {
  await sql`
    UPDATE work_unit_refinements
    SET status = ${status},
        processed_at = CASE WHEN ${status} IN ('done','skipped','failed') THEN NOW() ELSE processed_at END
    WHERE id = ${refinementId}
  `;
}

async function loadUnitContributors(workUnitId: number): Promise<Map<number, number>> {
  const rows = await sql`
    SELECT contributor_id, attribution_weight FROM work_unit_contributors WHERE work_unit_id = ${workUnitId}
  `;
  const map = new Map<number, number>();
  for (const row of rows) map.set(row.contributor_id as number, Number(row.attribution_weight ?? 1));
  return map;
}

/**
 * Persist a refined unit: supersede the parent, insert the specific children
 * chained via previous_unit_id, assign credit-conserving attribution, and keep
 * the capability ledger canonical.
 */
async function persistRefinedChildren(
  candidate: { id: number; repo_id: number; source_event_ids: number[] },
  parent: { id: number; refinement_depth: number; shipped: boolean; shipped_at: string | null; candidate_id: number },
  config: ScoringConfig,
  items: RefineItem[],
  attributionByChild: Array<Map<number, number>>,
  treeCentrality: Map<string, number>
): Promise<number> {
  await sql`UPDATE work_units SET unit_status = 'superseded' WHERE id = ${parent.id}`;
  const repoId = candidate.repo_id;

  let inserted = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const facts = coerceFacts(item.facts);
    const goalAlignment = Math.max(1, Math.min(5, Math.round(Number((item as { goal_alignment?: number }).goal_alignment) || 3)));
    const centrality = clampCentrality(treeCentrality.get(item.capability_key) ?? 3);
    const derived = { ...derive(facts, config.derivation_weights), centrality, goal_alignment: goalAlignment };
    const rationale = buildRationale(facts, item.work_type as WorkUnit['work_type']);

    const ledgerId = await upsertCapabilityLedgerRow({
      repoId,
      capabilityKey: item.capability_key,
      title: item.summary,
      summary: item.summary,
      centrality,
      shippedAt: parent.shipped ? parent.shipped_at : null,
    });

    const insertedRows = await sql`
      INSERT INTO work_units (
        repo_id, candidate_id, work_type, role, capability_key, source_commit_shas, previous_unit_id,
        ledger_id, unit_status, summary, facts, derived, derivation_ruleset_version,
        extraction_confidence, extraction_source, flagged_for_review, shipped,
        rationale, size_metrics, shipped_at, source_event_ids, refinement_depth
      ) VALUES (
        ${repoId}, ${candidate.id}, ${item.work_type}, ${item.role}, ${item.capability_key},
        ${item.source_commit_shas ?? []}, ${parent.id},
        ${ledgerId}, 'active', ${item.summary}, ${JSON.stringify(facts)}, ${JSON.stringify(derived)},
        ${config.version}, ${Math.max(0, Math.min(1, Number(item.confidence) || 0.7))}, 'ai',
        false, ${parent.shipped}, ${JSON.stringify(rationale)}, NULL, ${parent.shipped ? parent.shipped_at : null},
        ${candidate.source_event_ids}, ${Math.min(MAX_REFINE_DEPTH, (parent.refinement_depth ?? 0) + 1)}
      )
      RETURNING id
    `;
    if (insertedRows.length === 0) continue;
    const childId = insertedRows[0].id as number;

    await sql`DELETE FROM work_unit_contributors WHERE work_unit_id = ${childId}`;
    const weights = attributionByChild[i] ?? new Map<number, number>();
    for (const [cid, weight] of weights) {
      if (weight <= 0) continue;
      await sql`
        INSERT INTO work_unit_contributors (work_unit_id, contributor_id, attribution_weight)
        VALUES (${childId}, ${cid}, ${Math.round(weight * 1000) / 1000})
        ON CONFLICT DO NOTHING
      `;
    }
    await upsertCapabilityLedgerRow({ repoId, capabilityKey: item.capability_key, centrality, shippedAt: parent.shipped ? parent.shipped_at : null, latestWorkUnitId: childId });
    inserted++;
  }
  return inserted;
}

// ── Orchestration ─────────────────────────────────────────────────────────────

/** Audit a repo's active units and enqueue refinements for flagged ones. */
export async function enqueueGranularityRefinements(repoId: number): Promise<number> {
  const rows = (await sql`
    SELECT id, candidate_id, summary, facts, size_metrics, extraction_source, extraction_confidence,
           refinement_depth, audited
    FROM work_units
    WHERE repo_id = ${repoId} AND COALESCE(unit_status, 'active') = 'active' AND work_type <> 'Review'
  `) as unknown as AuditRow[];

  let enqueued = 0;
  for (const row of rows) {
    const reasons = auditUnitGranularity(row);
    if (reasons.length === 0) continue;
    const inserted = await sql`
      INSERT INTO work_unit_refinements (repo_id, work_unit_id, reason, status)
      VALUES (${repoId}, ${row.id}, ${reasons.join(', ')}, 'pending')
      ON CONFLICT (work_unit_id) DO NOTHING
      RETURNING id
    `;
    if (inserted.length > 0) enqueued++;
  }
  return enqueued;
}

/**
 * Process pending granularity refinements in batches, bounded by `budget`.
 * Splits flagged units into specific children, supersedes parents, and rescales
 * attribution so no contributor's credit increases from the split.
 */
export async function processGranularityRefinements(
  repoId: number,
  aiOptions?: AiCallOptions,
  opts?: { budget?: number; onProgress?: (done: number, total: number) => void }
): Promise<number> {
  const budget = opts?.budget ?? PER_RUN_BUDGET;
  if (!hasApiKey(aiOptions)) return 0;

  const config = (await import('./config')).getRepoScoringConfig;
  const scoringConfig = await config(repoId);
  const goalTree = await loadRepoGoalTree(repoId).catch(() => null);
  const goalTreeBlock = goalTree ? formatGoalTreeBlock(goalTree) : '';
  const treeCentrality = new Map<string, number>();
  for (const cap of goalTree?.capabilities ?? []) treeCentrality.set(cap.key, cap.centrality);

  const pending = await loadRefinementCandidates(repoId, budget);
  if (pending.length === 0) return 0;

  let processed = 0;
  for (let start = 0; start < pending.length; start += REFINE_BATCH_SIZE) {
    const batch = pending.slice(start, start + REFINE_BATCH_SIZE);
    const prepared: Array<{
      refinement: RefinementCandidateRow;
      events: Array<Record<string, unknown>>;
      title: string;
      commitMessages: string[];
      prBody: string | null;
      filePaths: string[];
      clusters: string[][];
    }> = [];

    for (const refinement of batch) {
      const events = (await sql`
        SELECT id, repo_id, contributor_id, event_type, payload, created_at, before_sha, after_sha
        FROM github_events
        WHERE id = ANY(${refinement.source_event_ids}::bigint[])
        ORDER BY created_at ASC
      `) as Array<Record<string, unknown>>;
      if (events.length === 0) {
        await markRefinement(refinement.id, 'skipped');
        processed++;
        continue;
      }
      const first = events[0];
      const eventType = String(first.event_type ?? '');
      const filePaths = (await import('./extract')).extractChangedFilePaths(events);
      const clusters = filePaths.length > 1 ? clusterChangedFiles(filePaths) : [];
      prepared.push({
        refinement,
        events,
        title: (await import('./extract')).extractBestTitle(events, eventType),
        commitMessages: (await import('./extract')).extractCommitMessages(events),
        prBody: (await import('./extract')).extractPrBody(events),
        filePaths,
        clusters,
      });
    }

    if (prepared.length === 0) continue;

    let response: unknown = null;
    try {
      await acquireSlot('openrouter');
      const aiResponse = await callStructured(
        [
          { role: 'system', content: REFINE_SYSTEM_MESSAGE },
          { role: 'user', content: buildRefinePrompt(
            prepared.map((p) => ({
              // The prompt keys each broad unit by `id` (its work_unit_id) so
              // the model's unit_id responses map back to the correct row.
              unit: { id: p.refinement.work_unit_id, summary: p.refinement.summary, capability_key: p.refinement.capability_key, work_type: p.refinement.work_type },
              title: p.title,
              commitMessages: p.commitMessages,
              prBody: p.prBody,
              filePaths: p.filePaths,
              clusters: p.clusters,
            })),
            goalTreeBlock
          ) },
        ],
        REFINE_SCHEMA,
        'granularity_refine',
        aiOptions
      );
      if (aiResponse) {
        response = JSON.parse(stripCodeFences(aiResponse));
      }
    } catch (err) {
      console.warn('Granularity refinement batch failed:', err instanceof Error ? err.message : err);
    }

    const parsed = Array.isArray((response as { units?: unknown } | null)?.units)
      ? (response as { units: RefineUnitResponse[] }).units
      : [];

    for (const p of prepared) {
      // `work_unit_id` is BIGINT -> returned as a string by the driver; coerce
      // both sides so the model's numeric unit_id matches.
      const unitResponse = parsed.find((r) => Number(r.unit_id) === Number(p.refinement.work_unit_id));
      const items = unitResponse?.items ?? [];
      if (!unitResponse || items.length === 0) {
        await markRefinement(p.refinement.id, 'failed');
        processed++;
        continue;
      }

      // No-op / single-capability fixpoint: update in place and mark audited.
      if (items.length === 1 && unitResponse.single) {
        const item = items[0];
        const facts = coerceFacts(item.facts);
        const goalAlignment = Math.max(1, Math.min(5, Math.round(Number((item as { goal_alignment?: number }).goal_alignment) || 3)));
        const centrality = clampCentrality(treeCentrality.get(item.capability_key) ?? 3);
        const derived = { ...derive(facts, scoringConfig.derivation_weights), centrality, goal_alignment: goalAlignment };
        await sql`
          UPDATE work_units
          SET summary = ${item.summary}, work_type = ${item.work_type}, role = ${item.role},
              capability_key = ${item.capability_key}, facts = ${JSON.stringify(facts)},
              derived = ${JSON.stringify(derived)}, audited = true
          WHERE id = ${p.refinement.work_unit_id}
        `;
        await markRefinement(p.refinement.id, 'done');
        processed++;
        continue;
      }

      // Real split: supersede parent, insert children, conserve attribution.
      const parentRow = (await sql`
        SELECT id, refinement_depth, shipped, shipped_at, candidate_id
        FROM work_units WHERE id = ${p.refinement.work_unit_id}
      `)[0];
      if (!parentRow) {
        await markRefinement(p.refinement.id, 'skipped');
        processed++;
        continue;
      }
      const parentWeights = await loadUnitContributors(p.refinement.work_unit_id);

      // Per-child evidence contributors: map each child's source_commit_shas to
      // authors via the candidate's commit data. Empty when no author data, in
      // which case computeConservingWeights even-slices the parent's weights.
      const primaryContributorId = Number(p.events[0]?.contributor_id ?? 0);
      const shaContributors = await buildShaContributorMap(p.events, primaryContributorId);
      const childrenEvidence: Array<{ evidenceContributors: number[] }> = items.map((item) => {
        const shas = Array.isArray(item.source_commit_shas) ? item.source_commit_shas : [];
        const contributors: number[] = [];
        for (const sha of shas) {
          const cid = shaContributors.get(sha);
          if (cid !== undefined) contributors.push(cid);
        }
        return { evidenceContributors: contributors };
      });
      const attributionByChild = computeConservingWeights(parentWeights, childrenEvidence);

      await persistRefinedChildren(
        { id: p.refinement.candidate_id, repo_id: repoId, source_event_ids: p.refinement.source_event_ids },
        { id: p.refinement.work_unit_id, refinement_depth: Number(parentRow.refinement_depth ?? 0), shipped: Boolean(parentRow.shipped), shipped_at: parentRow.shipped_at as string | null, candidate_id: p.refinement.candidate_id },
        scoringConfig,
        items,
        attributionByChild,
        treeCentrality
      );
      await markRefinement(p.refinement.id, 'done');
      processed++;
    }
  }

  opts?.onProgress?.(processed, pending.length);
  return processed;
}

/**
 * Background quality job entry point: audit -> enqueue -> process -> rescore.
 * Runs offline (worker / script), never in the blocking analyse path.
 */
export async function runRepoRefinementQuality(
  repoId: number,
  aiOptions?: AiCallOptions,
  opts?: { budget?: number }
): Promise<{ enqueued: number; refined: number }> {
  const enqueued = await enqueueGranularityRefinements(repoId);
  const refined = await processGranularityRefinements(repoId, aiOptions, { budget: opts?.budget });
  if (refined > 0) {
    const { scoreRepo } = await import('./index');
    await scoreRepo(repoId);
  }
  return { enqueued, refined };
}

/**
 * Build a commit-sha -> contributor map from a candidate's events, resolving
 * commit authors the same way attribution does (github_id, username, email).
 * Returns an empty map when the events carry no author data (common for
 * webhook-only ingestion), in which case credit conservation even-slices.
 */
export async function buildShaContributorMap(
  events: Array<Record<string, unknown>>,
  primaryContributorId: number
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const authorsBySha: Array<{ sha: string; author: Record<string, unknown> }> = [];
  for (const event of events) {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    for (const commit of commits) {
      if (!commit || typeof commit !== 'object') continue;
      const c = commit as Record<string, unknown>;
      const sha = typeof c.sha === 'string' ? c.sha : null;
      const author = c.author;
      if (sha && author && typeof author === 'object') {
        authorsBySha.push({ sha, author: author as Record<string, unknown> });
      }
    }
  }
  if (authorsBySha.length === 0) return map;

  const ids: number[] = [];
  const usernames: string[] = [];
  const emails: string[] = [];
  for (const { author } of authorsBySha) {
    if (typeof author.id === 'number') ids.push(author.id);
    if (typeof author.login === 'string' && author.login) usernames.push(author.login);
    if (typeof author.email === 'string' && author.email) emails.push(author.email);
  }

  const resolved = new Map<string, number>();
  if (ids.length > 0 || usernames.length > 0 || emails.length > 0) {
    let rows: Array<{ id: number; github_id: number | null; username: string | null; email: string | null }> = [];
    try {
      rows = (await sql`
        SELECT id, github_id, username, email FROM github_contributors
        WHERE github_id = ANY(${ids}::bigint[])
           OR username = ANY(${usernames}::text[])
           OR email = ANY(${emails}::text[])
      `) as Array<{ id: number; github_id: number | null; username: string | null; email: string | null }>;
    } catch {
      rows = [];
    }
    for (const row of rows) {
      if (row.github_id != null) resolved.set(`id:${row.github_id}`, row.id);
      if (row.username) resolved.set(`u:${row.username}`, row.id);
      if (row.email) resolved.set(`e:${row.email}`, row.id);
    }
  }

  for (const { sha, author } of authorsBySha) {
    let cid: number | null = null;
    if (typeof author.id === 'number' && resolved.has(`id:${author.id}`)) cid = resolved.get(`id:${author.id}`)!;
    else if (typeof author.login === 'string' && resolved.has(`u:${author.login}`)) cid = resolved.get(`u:${author.login}`)!;
    else if (typeof author.email === 'string' && resolved.has(`e:${author.email}`)) cid = resolved.get(`e:${author.email}`)!;
    map.set(sha, cid ?? primaryContributorId);
  }
  return map;
}

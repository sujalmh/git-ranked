import type {
  DimensionScores,
  RawEvent,
  ReviewFacts,
  ScoringConfig,
  WorkUnit,
} from './types';
import { clamp } from './derivation';
import { decayWeight } from './decay';
import { reviewValue } from './review';
import { goalAlignmentFactor, nodeImportance, stageWeight, DEFAULT_IMPACT_PROGRESS } from './goals';

export const WORK_ROLE_MULTIPLIERS = {
  // Lifecycle roles distinguish why the unit mattered. A first shipped
  // subsystem is worth more than a routine build step; small repairs are
  // intentionally worth less even when they are numerous.
  foundation: 1.5,
  build: 1.25,
  feature: 1,
  advancement: 1.2,
  refinement: 0.9,
  repair: 0.45,
  security: 1.15,
  performance: 1.15,
  review: 1,
} as const;

export function roleMultiplier(role: WorkUnit['role']): number {
  return role ? WORK_ROLE_MULTIPLIERS[role] ?? 1 : 1;
}

export function softCap(value: number, cap: number, scaleFactor: number = cap): number {
  if (cap <= 0 || value <= 0) return 0;
  return Math.min(cap, cap * (1 - Math.exp(-value / scaleFactor)));
}

/**
 * Relative rank: map each composite to the percent of contributors in the same
 * cohort whose composite is at or below it (0-100). Tied composites share the
 * same percentile. Deterministic and order-independent.
 */
export function computePercentiles(composites: number[]): Map<number, number> {
  const result = new Map<number, number>();
  if (composites.length === 0) return result;

  for (const c of composites) {
    let below = 0;
    for (const other of composites) {
      if (other <= c) below++;
    }
    const pct = (below / composites.length) * 100;
    result.set(c, Math.round(pct * 10) / 10);
  }
  return result;
}

export function computeConsistency(rawEvents: RawEvent[]): number {
  const activeDays = new Set<string>();
  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const event of rawEvents) {
    if (!event.created_at) continue;
    const date = new Date(event.created_at);
    const ts = date.getTime();
    if (!Number.isFinite(ts)) continue;

    if (ts < minTime) minTime = ts;
    if (ts > maxTime) maxTime = ts;

    const dateStr = date.toISOString().split('T')[0];
    activeDays.add(dateStr);
  }

  if (activeDays.size === 0) return 0;

  const spanDays =
    Number.isFinite(minTime) && Number.isFinite(maxTime)
      ? Math.max(1, Math.round((maxTime - minTime) / 86_400_000) + 1)
      : 1;

  const activeRatio = activeDays.size / spanDays;
  const breadth = Math.min(activeDays.size, 20);
  const regularity = activeDays.size >= 3 ? activeRatio * 30 : activeRatio * 10;

  const rawScore = breadth + regularity; // max 50
  // Scale to 0-100
  return Math.min(100, Math.round(rawScore * 2 * 10) / 10);
}

/**
 * Quality aggregator (scoring v6). execution_quality is a per-unit rating, so a
 * contributor with more units must not win quality merely by volume — that is
 * what the per-node impact curve already rewards. Keeps the weighted mean with
 * k=0 (no volume bonus): divide by the number of extracted units, not by the
 * supplied credit, so decay and proportional attribution scale a unit down
 * instead of disappearing inside a re-normalized mean.
 */
export function boundedWorkUnitMean(
  contributions: number[],
  weights: number[],
  k = 0.3,
  scale = 20
): number {
  if (contributions.length === 0) return 0;
  const weightedSum = contributions.reduce(
    (sum, contribution, index) => sum + contribution * (weights[index] ?? 0),
    0
  );
  if (weightedSum <= 0) return 0;

  const weightedMean = weightedSum / contributions.length;
  const sustainedActivityBonus = 1 + k * Math.log1p(contributions.length);
  return weightedMean * sustainedActivityBonus * scale;
}

/**
 * Two-layer saturating progress credit (scoring v6).
 *
 * Layer 1 — per capability NODE: impact saturates as the sum of a node's units
 * grows, so a contributor who ships a capability in one big PR or five small
 * PRs earns the same credit. A node is scaled by its repo-goal `centrality`
 * (deterministic from the goal tree) and each unit by `stageWeight` and
 * `goal_alignment`.
 *
 * Layer 2 — per CANDIDATE (PR): a single candidate's total node credit is
 * itself saturating, so a PR that the model over-splits into many nodes cannot
 * multiply its credit, while genuine work spread across many PRs still
 * accumulates. A node touched by several candidates splits its (capped) credit
 * among them proportionally, preserving cross-PR dedup.
 */
export function computeNodeProgressImpact(
  entries: Array<{ unit: WorkUnit; weight: number; credit: number }>,
  config: { nodeCap: number; nodeScale: number; candidateCap: number; candidateScale: number; stageWeights: Record<string, number> }
): number {
  if (entries.length === 0) return 0;

  const nodeRaw = new Map<string, { raw: number; representative: WorkUnit }>();
  for (const { unit, weight, credit } of entries) {
    const key = unit.capability_key || `unit:${unit.id ?? 'unknown'}`;
    const node = nodeRaw.get(key) ?? { raw: 0, representative: unit };
    node.raw += (unit.derived.value ?? 1.0) * stageWeight(unit.role, config.stageWeights) * goalAlignmentFactor(unit.derived.goal_alignment ?? 3) * weight * credit;
    nodeRaw.set(key, node);
  }

  // Per-node credit (cross-candidate dedup happens here).
  const nodeCredit = new Map<string, { credit: number; raw: number }>();
  for (const [key, node] of nodeRaw) {
    if (node.raw <= 0) continue;
    const importance = nodeImportance(node.representative.derived.centrality ?? 3);
    nodeCredit.set(key, {
      credit: importance * config.nodeCap * (1 - Math.exp(-node.raw / config.nodeScale)),
      raw: node.raw,
    });
  }
  if (nodeCredit.size === 0) return 0;

  // Layer 2: distribute each node's capped credit to the candidates that
  // contributed to it (proportional to their raw share), then saturate per
  // candidate so a single over-split PR is bounded.
  const candidateRaw = new Map<number, number>();
  for (const { unit, weight, credit } of entries) {
    const key = unit.capability_key || `unit:${unit.id ?? 'unknown'}`;
    const node = nodeCredit.get(key);
    if (!node || node.raw <= 0) continue;
    const unitRaw = (unit.derived.value ?? 1.0) * stageWeight(unit.role, config.stageWeights) * goalAlignmentFactor(unit.derived.goal_alignment ?? 3) * weight * credit;
    const share = unitRaw / node.raw;
    const cand = unit.candidate_id ?? -1;
    candidateRaw.set(cand, (candidateRaw.get(cand) ?? 0) + share * node.credit);
  }

  let total = 0;
  for (const raw of candidateRaw.values()) {
    total += config.candidateCap * (1 - Math.exp(-raw / config.candidateScale));
  }
  return total;
}

export function scoreContributor(
  workUnits: WorkUnit[],
  rawEvents: RawEvent[],
  config: ScoringConfig,
  decayProfile: 'current' | 'all_time' = 'current',
  asOf: Date | string = new Date(),
  attributionWeights?: Map<number, number>,
  codeOwnership?: number
): DimensionScores {
  let rawQualitySum = 0;
  let rawCollabSum = 0;
  const qualityContributions: number[] = [];
  const contributionWeights: number[] = [];
  const nodeEntries: Array<{ unit: WorkUnit; weight: number; credit: number }> = [];

  let minShippedTime = Infinity;
  let maxShippedTime = -Infinity;

  // Build a map of review outcome bumps per candidate / correlation key if available
  // Map<candidate_id, bump>
  const candidateReviewBumps = new Map<number, number>();

  for (const unit of workUnits) {
    if (unit.unit_status === 'superseded') continue;
    if (unit.work_type === 'Review') {
      const rf = unit.facts as ReviewFacts;
      if (rf.blocking_issue_found && rf.confirmed_valid) {
        candidateReviewBumps.set(unit.candidate_id, 1);
      } else if (rf.blocking_issue_found && !rf.confirmed_valid) {
        if (!candidateReviewBumps.has(unit.candidate_id)) {
          candidateReviewBumps.set(unit.candidate_id, -1);
        }
      } else if (rf.substantiveness === 'thorough') {
        if (!candidateReviewBumps.has(unit.candidate_id)) {
          candidateReviewBumps.set(unit.candidate_id, 1);
        }
      }
    }
  }

  const halfLife = config.decay_half_life_days ?? 60;

  for (const unit of workUnits) {
    if (!unit.shipped && unit.work_type !== 'Review') continue;

    const shippedAt = unit.shipped_at || unit.created_at;
    if (shippedAt) {
      const ts = new Date(shippedAt).getTime();
      if (Number.isFinite(ts)) {
        if (ts < minShippedTime) minShippedTime = ts;
        if (ts > maxShippedTime) maxShippedTime = ts;
      }
    }

    const weight = decayProfile === 'current' ? decayWeight(shippedAt, asOf, halfLife) : 1.0;
    // Proportional-attribution credit: a co-authored work unit is worth only its
    // share to each contributor (defaults to 1.0 = full credit).
    const credit = attributionWeights?.get(unit.id ?? -1) ?? 1;

    if (unit.work_type === 'Review') {
      const rf = unit.facts as ReviewFacts;
      const rVal = reviewValue(rf);
      rawCollabSum += rVal * weight * credit;
    } else {
      // General work unit (Feature, BugFix, Infrastructure, etc.). Per-node
      // progress credit is computed after the loop; granularity and per-unit
      // repo_impact guesses no longer move the score — `centrality` (goal tree)
      // and `goal_alignment` do.
      nodeEntries.push({ unit, weight, credit });

      // Quality: Layer-2 review bump applied to execution_quality
      const reviewBump = candidateReviewBumps.get(unit.candidate_id) ?? 0;
      const finalExecution = clamp(1, 5, unit.derived.execution_quality + reviewBump);
      qualityContributions.push(finalExecution * 4);
      contributionWeights.push(weight * credit);
    }
  }

  // Impact: two-layer saturating progress credit anchored to the repo goal tree
  // (per-node granularity-invariance + per-PR bound on over-splitting).
  const ip = { ...DEFAULT_IMPACT_PROGRESS, ...(config.caps.impactProgress ?? {}) };
  const rawImpactSum = computeNodeProgressImpact(nodeEntries, ip);

  // Quality: pure work-unit mean. execution_quality is a per-unit rating, so a
  // contributor with more units must not win the quality dimension merely by
  // volume — that is what the per-node impact curve already rewards.
  rawQualitySum = boundedWorkUnitMean(qualityContributions, contributionWeights, 0);
  const caps = config.caps;
  let impact = Math.round(softCap(rawImpactSum, caps.impact, ip.scaleFactor) * 10) / 10;
  const quality = Math.round(softCap(rawQualitySum, caps.quality, 200) * 10) / 10;
  const collaboration = Math.round(softCap(rawCollabSum, caps.collaboration, 100) * 10) / 10;

  // Shipped-code ownership blend (scoring v6): when git-blame ownership data is
  // present, impact is blended toward `100 × share` — how much of the repo's
  // final code this contributor owns. This rewards code that ships and stays,
  // not just effort volume. Absent data leaves impact unchanged.
  if (codeOwnership !== undefined && codeOwnership !== null && (ip.ownershipWeight ?? 0) > 0) {
    const ownershipImpact = clamp(0, 100, codeOwnership * 100);
    impact =
      Math.round((impact * (1 - ip.ownershipWeight) + ownershipImpact * ip.ownershipWeight) * 10) / 10;
  }

  // Consistency (pure timestamp math, 0-100 scale)
  const consistency = computeConsistency(rawEvents);

  // Composite calculation with fixed per-profile weights so contributor scores
  // stay comparable regardless of whether they have collaboration activity.
  const cw = caps.compositeWeights;
  const compositeRaw =
    impact * cw.impact +
    quality * cw.quality +
    collaboration * cw.collaboration +
    consistency * cw.consistency;

  const composite = Math.min(100, Math.round(compositeRaw * 10) / 10);

  const window_start = Number.isFinite(minShippedTime) ? new Date(minShippedTime).toISOString() : null;
  const window_end = Number.isFinite(maxShippedTime) ? new Date(maxShippedTime).toISOString() : null;

  const contributor_id = 0; // overwritten by caller in scoring/index.ts
  const repo_id = workUnits[0]?.repo_id ?? rawEvents[0]?.repo_id ?? 0;

  return {
    contributor_id,
    repo_id,
    window_start,
    window_end,
    decay_profile: decayProfile,
    impact,
    quality,
    collaboration,
    consistency,
    composite,
    scoring_config_version: config.version,
    computed_at: new Date().toISOString(),
  };
}

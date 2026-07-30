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

export function softCap(value: number, cap: number, scaleFactor: number = cap): number {
  if (cap <= 0 || value <= 0) return 0;
  return Math.min(cap, cap * (1 - Math.exp(-value / scaleFactor)));
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

export function scoreContributor(
  workUnits: WorkUnit[],
  rawEvents: RawEvent[],
  config: ScoringConfig,
  decayProfile: 'current' | 'all_time' = 'current',
  asOf: Date | string = new Date()
): DimensionScores {
  let rawImpactSum = 0;
  let rawQualitySum = 0;
  let rawCollabSum = 0;

  let minShippedTime = Infinity;
  let maxShippedTime = -Infinity;

  // Build a map of review outcome bumps per candidate / correlation key if available
  // Map<candidate_id, bump>
  const candidateReviewBumps = new Map<number, number>();

  for (const unit of workUnits) {
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

    if (unit.work_type === 'Review') {
      const rf = unit.facts as ReviewFacts;
      const rVal = reviewValue(rf);
      rawCollabSum += rVal * weight;
    } else {
      // General work unit (Feature, BugFix, Infrastructure, etc.)
      const unitValue = unit.derived.value ?? 1.0;
      rawImpactSum += unitValue * 10 * weight;

      // Quality: Layer-2 review bump applied to execution_quality
      const reviewBump = candidateReviewBumps.get(unit.candidate_id) ?? 0;
      const finalExecution = clamp(1, 5, unit.derived.execution_quality + reviewBump);
      rawQualitySum += finalExecution * 4 * weight;
    }
  }

  // Soft-cap scaling:
  // Use non-saturating scale factors (250 for impact, 200 for quality/collab)
  const caps = config.caps;
  const impact = Math.round(softCap(rawImpactSum, caps.impact, 250) * 10) / 10;
  const quality = Math.round(softCap(rawQualitySum, caps.quality, 200) * 10) / 10;
  const collaboration = Math.round(softCap(rawCollabSum, caps.collaboration, 100) * 10) / 10;

  // Consistency (pure timestamp math, 0-100 scale)
  const consistency = computeConsistency(rawEvents);

  // Composite calculation with dynamic weight rebalancing when collaboration is 0
  const cw = caps.compositeWeights;
  let impactWeight = cw.impact;
  let qualityWeight = cw.quality;
  let collabWeight = cw.collaboration;
  let consistencyWeight = cw.consistency;

  if (collaboration === 0) {
    // Rebalance collaboration weight (0.20) across impact (0.50), quality (0.35), consistency (0.15)
    impactWeight = 0.50;
    qualityWeight = 0.35;
    collabWeight = 0.0;
    consistencyWeight = 0.15;
  }

  const compositeRaw =
    impact * impactWeight +
    quality * qualityWeight +
    collaboration * collabWeight +
    consistency * consistencyWeight;

  const composite = Math.min(100, Math.round(compositeRaw * 10) / 10);

  const window_start = Number.isFinite(minShippedTime) ? new Date(minShippedTime).toISOString() : null;
  const window_end = Number.isFinite(maxShippedTime) ? new Date(maxShippedTime).toISOString() : null;

  const contributor_id = 0; // overwritten by caller in scoring/index.ts
  const repo_id = workUnits[0]?.repo_id ?? rawEvents[0]?.id ?? 0;

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

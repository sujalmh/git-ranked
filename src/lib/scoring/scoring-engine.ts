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

export function softCap(value: number, cap: number): number {
  if (cap <= 0 || value <= 0) return 0;
  return Math.min(cap, cap * (1 - Math.exp(-value / cap)));
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

  return Math.min(50, Math.round((breadth + regularity) * 10) / 10);
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

  // Soft-cap scaling
  const caps = config.caps;
  const impact = Math.round(softCap(rawImpactSum, caps.impact) * 10) / 10;
  const quality = Math.round(softCap(rawQualitySum, caps.quality) * 10) / 10;
  const collaboration = Math.round(softCap(rawCollabSum, caps.collaboration) * 10) / 10;

  // Consistency (pure timestamp math, no decay)
  const consistency = computeConsistency(rawEvents);

  // Composite calculation
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

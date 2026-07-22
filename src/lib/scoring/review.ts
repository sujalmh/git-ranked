import type { ReviewFacts } from './types';

const TIER_BASE_VALUES: Record<ReviewFacts['substantiveness'], number> = {
  rubber_stamp: 0.05,
  light: 0.2,
  moderate: 0.5,
  thorough: 0.8,
};

export function reviewValue(facts: ReviewFacts): number {
  const base = TIER_BASE_VALUES[facts.substantiveness] ?? 0.05;
  let multiplier = 1.0;

  if (facts.blocking_issue_found) {
    multiplier = facts.confirmed_valid ? 2.5 : 1.2;
  }

  return base * multiplier;
}

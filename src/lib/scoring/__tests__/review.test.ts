import { describe, expect, it } from 'vitest';
import { reviewValue } from '../review';
import type { ReviewFacts } from '../types';

describe('review value calculation', () => {
  it('correctly orders substantiveness tiers', () => {
    const rubber: ReviewFacts = { substantiveness: 'rubber_stamp', blocking_issue_found: false, confirmed_valid: false };
    const light: ReviewFacts = { substantiveness: 'light', blocking_issue_found: false, confirmed_valid: false };
    const moderate: ReviewFacts = { substantiveness: 'moderate', blocking_issue_found: false, confirmed_valid: false };
    const thorough: ReviewFacts = { substantiveness: 'thorough', blocking_issue_found: false, confirmed_valid: false };

    expect(reviewValue(rubber)).toBeGreaterThan(0);
    expect(reviewValue(light)).toBeGreaterThan(reviewValue(rubber));
    expect(reviewValue(moderate)).toBeGreaterThan(reviewValue(light));
    expect(reviewValue(thorough)).toBeGreaterThan(reviewValue(moderate));
  });

  it('multiplies score significantly when a confirmed blocking issue is caught', () => {
    const baseReview: ReviewFacts = { substantiveness: 'thorough', blocking_issue_found: false, confirmed_valid: false };
    const blockingConfirmed: ReviewFacts = { substantiveness: 'thorough', blocking_issue_found: true, confirmed_valid: true };

    const baseVal = reviewValue(baseReview);
    const blockingVal = reviewValue(blockingConfirmed);

    expect(blockingVal).toBeGreaterThanOrEqual(2.5 * baseVal);
  });
});

import { describe, expect, it } from 'vitest';
import { computeHealthMetrics, type RepoHealthSignals } from '../repo-score';

function signals(overrides: Partial<RepoHealthSignals> = {}): RepoHealthSignals {
  return {
    prsMerged: 0,
    prsOpened: 0,
    pushes: 0,
    reviews: 0,
    releases: 0,
    fixes: 0,
    activeContributors: 0,
    reviewerCount: 0,
    consistencyRatio: 1,
    deliveredValue: 0,
    unitCount: 0,
    wuContributors: 0,
    qualitySum: 0,
    qualityCount: 0,
    testDocCount: 0,
    totalEvents: 0,
    evenness: 0,
    ...overrides,
  };
}

describe('repo scoring (work-unit driven, fair, meaningful)', () => {
  it('an inactive repo scores honestly low (no artificial floors)', () => {
    const m = computeHealthMetrics(signals());
    expect(m.delivery).toBe(0);
    expect(m.codeQuality).toBe(0);
    expect(m.reviewHealth).toBe(0);
    expect(m.knowledgeDistribution).toBe(0);
    expect(m.overallScore).toBeLessThanOrEqual(30);
  });

  it('100 trivial PRs by one author do NOT outscore 10 large features by a team', () => {
    // Spam: 100 trivial units, each carrying ~0.025 delivered value (the value
    // model's honest weight for trivial work) by a single contributor.
    const spam = computeHealthMetrics(
      signals({
        prsMerged: 100,
        pushes: 100,
        activeContributors: 1,
        deliveredValue: 100 * 0.025,
        unitCount: 100,
        wuContributors: 1,
        qualitySum: 100,
        qualityCount: 100,
        evenness: 0,
      })
    );

    // Healthy: 10 large features (~0.6 value each) by a 5-person team.
    const healthy = computeHealthMetrics(
      signals({
        prsMerged: 10,
        pushes: 10,
        activeContributors: 5,
        reviewerCount: 3,
        deliveredValue: 10 * 0.6,
        unitCount: 10,
        wuContributors: 5,
        qualitySum: 40,
        qualityCount: 10,
        testDocCount: 8,
        evenness: 0.6,
      })
    );

    expect(spam.overallScore).toBeLessThan(healthy.overallScore);
  });

  it('per-capita delivery prevents a single contributor from inflating a repo', () => {
    const soloMega = computeHealthMetrics(
      signals({
        prsMerged: 60,
        pushes: 60,
        activeContributors: 1,
        deliveredValue: 60 * 0.6,
        unitCount: 60,
        wuContributors: 1,
        evenness: 0,
      })
    );

    const distributed = computeHealthMetrics(
      signals({
        prsMerged: 60,
        pushes: 60,
        activeContributors: 6,
        deliveredValue: 60 * 0.6,
        unitCount: 60,
        wuContributors: 6,
        evenness: 0.8,
      })
    );

    expect(distributed.delivery).toBeLessThan(soloMega.delivery);
  });

  it('code quality is driven by execution_quality + test/doc coverage (not volume)', () => {
    const noTests = computeHealthMetrics(
      signals({ unitCount: 10, qualitySum: 30, qualityCount: 10, testDocCount: 0, deliveredValue: 5, wuContributors: 2 })
    );
    const tested = computeHealthMetrics(
      signals({ unitCount: 10, qualitySum: 40, qualityCount: 10, testDocCount: 10, deliveredValue: 5, wuContributors: 2 })
    );

    expect(tested.codeQuality).toBeGreaterThan(noTests.codeQuality);
  });

  it('review health reflects review coverage of merged PRs', () => {
    // With recorded review events, coverage drives the score.
    const lightReviewed = computeHealthMetrics(signals({ prsMerged: 10, prsOpened: 10, reviews: 5 }));
    const wellReviewed = computeHealthMetrics(signals({ prsMerged: 10, prsOpened: 10, reviews: 20 }));

    expect(wellReviewed.reviewHealth).toBeGreaterThan(lightReviewed.reviewHealth);
    // ~2 reviews per PR is a healthy bar.
    expect(wellReviewed.reviewHealth).toBeGreaterThanOrEqual(90);
  });

  it('all metrics stay within 0-100', () => {
    const extremes = computeHealthMetrics(
      signals({
        prsMerged: 1000,
        prsOpened: 1000,
        pushes: 1000,
        reviews: 2000,
        releases: 100,
        activeContributors: 200,
        reviewerCount: 100,
        deliveredValue: 5000,
        unitCount: 5000,
        wuContributors: 200,
        qualitySum: 25000,
        qualityCount: 5000,
        testDocCount: 5000,
        evenness: 1,
      })
    );

    for (const v of Object.values(extremes)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

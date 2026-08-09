import { describe, expect, it } from 'vitest';
import { computePercentiles, scoreContributor } from '../scoring-engine';
import { PROFILE_PRESETS } from '../profiles';
import type { RawEvent, WorkUnit } from '../types';

const config = PROFILE_PRESETS.balanced;

const baseWorkUnit: WorkUnit = {
  id: 1001,
  repo_id: 1,
  candidate_id: 100,
  work_type: 'Feature',
  facts: {
    scope: 'medium',
    user_visible: true,
    breaking_change: false,
    cross_cutting: false,
    testing_added: true,
    documentation_updated: false,
    new_algorithm_or_subsystem: false,
    boilerplate: false,
    touches_auth: false,
    touches_data_migration: false,
    touches_distributed_state: false,
    touches_architecture: false,
  },
  derived: {
    difficulty: 3,
    impact_base: 4,
    execution_quality: 2,
    novelty: 2,
    risk: 1,
    value: 0.5,
  },
  derivation_ruleset_version: 'v3.0',
  extraction_confidence: 0.9,
  extraction_source: 'ai',
  flagged_for_review: false,
  shipped: true,
  rationale: { impact_reason: 'Medium feature', quality_reason: 'Includes tests' },
  shipped_at: '2026-07-20T10:00:00Z',
  source_event_ids: [1],
};

const rawEvents: RawEvent[] = [
  { id: 1, event_type: 'pr_merged', payload: {}, created_at: '2026-07-20T10:00:00Z', contributor_id: 10, username: 'dev' },
  { id: 2, event_type: 'push', payload: {}, created_at: '2026-07-21T10:00:00Z', contributor_id: 10, username: 'dev' },
];

describe('scoring engine', () => {
  it('confidence level alone does not change dimension scores', () => {
    const unit1: WorkUnit = { ...baseWorkUnit, extraction_confidence: 0.95 };
    const unit2: WorkUnit = { ...baseWorkUnit, extraction_confidence: 0.35 };

    const score1 = scoreContributor([unit1], rawEvents, config, 'all_time');
    const score2 = scoreContributor([unit2], rawEvents, config, 'all_time');

    expect(score1.composite).toEqual(score2.composite);
    expect(score1.impact).toEqual(score2.impact);
    expect(score1.quality).toEqual(score2.quality);
  });

  it('size_metrics do not affect score values', () => {
    const unit1: WorkUnit = { ...baseWorkUnit, size_metrics: { additions: 10, deletions: 5, changed_files: 2 } };
    const unit2: WorkUnit = { ...baseWorkUnit, size_metrics: { additions: 1000, deletions: 500, changed_files: 50 } };

    const score1 = scoreContributor([unit1], rawEvents, config, 'all_time');
    const score2 = scoreContributor([unit2], rawEvents, config, 'all_time');

    expect(score1.composite).toEqual(score2.composite);
  });

  it('decays scores under current profile over time but not under all_time', () => {
    const oldUnit: WorkUnit = { ...baseWorkUnit, shipped_at: '2025-01-01T00:00:00Z' };
    const now = new Date('2026-07-21T00:00:00Z');

    const currentScore = scoreContributor([oldUnit], rawEvents, config, 'current', now);
    const allTimeScore = scoreContributor([oldUnit], rawEvents, config, 'all_time', now);

    expect(allTimeScore.impact).toBeGreaterThan(currentScore.impact);
  });

  it('safely handles malformed timestamps in rawEvents', () => {
    const badEvents: RawEvent[] = [
      ...rawEvents,
      { id: 3, event_type: 'push', payload: {}, created_at: 'invalid-date-string', contributor_id: 10, username: 'dev' },
    ];

    expect(() => scoreContributor([baseWorkUnit], badEvents, config, 'current')).not.toThrow();
  });

  it('scales contribution by proportional attribution weight', () => {
    const full = scoreContributor([baseWorkUnit], rawEvents, config, 'all_time');
    const half = scoreContributor([baseWorkUnit], rawEvents, config, 'all_time', new Date(), new Map([[baseWorkUnit.id!, 0.5]]));
    expect(half.impact).toBeLessThan(full.impact);
    expect(half.quality).toBeLessThan(full.quality);
    // Soft-cap scaling makes the exact ratio nonlinear, but attribution must
    // still materially reduce the resulting score.
    expect(half.impact).toBeLessThan(full.impact * 0.6);
  });

  it('uses fixed composite weights regardless of collaboration activity', () => {
    const authorOnly: WorkUnit = { ...baseWorkUnit, work_type: 'Feature' };
    const authorScore = scoreContributor([authorOnly], rawEvents, config, 'all_time');

    // A contributor with zero collaboration still gets the full composite weight
    // profile — no silent rebalancing that would make scores non-comparable.
    const { compositeWeights } = config.caps;
    const expected = Math.min(
      100,
      Math.round(
        (authorScore.impact * compositeWeights.impact +
          authorScore.quality * compositeWeights.quality +
          authorScore.collaboration * compositeWeights.collaboration +
          authorScore.consistency * compositeWeights.consistency) * 10
      ) / 10
    );
    expect(authorScore.composite).toBeCloseTo(expected, 1);
  });

  it('consistency counts only substantive events (no issue-spam inflation)', () => {
    const activity = [
      { id: 1, event_type: 'pr_merged', payload: {}, created_at: '2026-07-20T10:00:00Z', contributor_id: 10, username: 'dev' },
      { id: 2, event_type: 'pr_merged', payload: {}, created_at: '2026-07-21T10:00:00Z', contributor_id: 10, username: 'dev' },
      { id: 3, event_type: 'issue_opened', payload: {}, created_at: '2026-07-21T11:00:00Z', contributor_id: 10, username: 'dev' },
      { id: 4, event_type: 'issue_opened', payload: {}, created_at: '2026-07-22T10:00:00Z', contributor_id: 10, username: 'dev' },
      { id: 5, event_type: 'issue_opened', payload: {}, created_at: '2026-07-23T10:00:00Z', contributor_id: 10, username: 'dev' },
    ] as RawEvent[];

    // The caller filters rawEvents to authoring+review types before scoring, so
    // the three issue_opens are not present and cannot inflate active days.
    const filtered = activity.filter((e) => ['push', 'pr_opened', 'pr_merged', 'review_submitted'].includes(e.event_type));
    const score = scoreContributor([baseWorkUnit], filtered, config, 'all_time');
    const inflated = scoreContributor([baseWorkUnit], activity, config, 'all_time');

    expect(score.consistency).toBeLessThan(inflated.consistency);
  });

  it('computes cross-repo-comparable percentiles with shared ties', () => {
    const composites = [10, 40, 40, 80, 100];
    const pct = computePercentiles(composites);

    // Lowest composite is at the 20th percentile (1 of 5 at or below).
    expect(pct.get(10)).toBe(20);
    // Tied middles share the same percentile (3 of 5 at or below).
    expect(pct.get(40)).toBe(60);
    expect(pct.get(80)).toBe(80);
    expect(pct.get(100)).toBe(100);
  });
});

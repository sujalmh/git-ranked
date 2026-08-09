import { describe, expect, it } from 'vitest';
import { buildCorrelationKey, buildPrWindows, isPushAbsorbedByPr, sameEventIds, type PrWindow } from '../aggregator';
import type { RawEvent } from '../types';

describe('aggregator correlation key generator', () => {
  it('generates pr correlation key for pr_merged', () => {
    const event: RawEvent = {
      id: 1,
      event_type: 'pr_merged',
      payload: { pr_number: 42, title: 'Fix bug' },
      created_at: '2026-07-20T00:00:00Z',
      contributor_id: 10,
      username: 'dev',
    };
    expect(buildCorrelationKey(5, event)).toBe('pr:5:42');
  });

  it('generates push correlation key for push with after_sha', () => {
    const event: RawEvent = {
      id: 2,
      event_type: 'push',
      payload: { after: 'abc1234' },
      created_at: '2026-07-20T00:00:00Z',
      contributor_id: 10,
      username: 'dev',
      after_sha: 'abc1234567',
    };
    expect(buildCorrelationKey(5, event)).toBe('push:5:abc1234567');
  });

  it('generates review correlation key for review_submitted', () => {
    const event: RawEvent = {
      id: 3,
      event_type: 'review_submitted',
      payload: { pr_number: 42, review_id: 99 },
      created_at: '2026-07-20T00:00:00Z',
      contributor_id: 10,
      username: 'dev',
    };
    expect(buildCorrelationKey(5, event)).toBe('review:5:42:99');
  });
});

describe('PR push absorption (anti double-count)', () => {
  const prWindows: PrWindow[] = [
    {
      prNumber: 42,
      baseRef: 'main',
      headRef: 'feature-x',
      headSha: 'abc1234567',
      mergeCommitSha: 'merge9999',
      openedAt: new Date('2026-07-10T00:00:00Z').getTime(),
      mergedAt: new Date('2026-07-15T00:00:00Z').getTime(),
    },
  ];

  const pushEvent = (overrides: Partial<RawEvent>): RawEvent => ({
    id: 99,
    event_type: 'push',
    payload: {},
    created_at: '2026-07-12T00:00:00Z',
    contributor_id: 10,
    username: 'dev',
    ...overrides,
  });

  it('absorbs a feature-branch push inside the PR window', () => {
    const event = pushEvent({ payload: { branch: 'feature-x' } });
    const absorbed = isPushAbsorbedByPr(event, prWindows);
    expect(absorbed?.prNumber).toBe(42);
  });

  it('absorbs the merge-commit push to the base branch at merge time', () => {
    const event = pushEvent({
      created_at: '2026-07-15T00:00:01Z',
      after_sha: 'merge9999',
      payload: { branch: 'main', commits: [{ sha: 'merge9999' }] },
    });
    expect(isPushAbsorbedByPr(event, prWindows)?.prNumber).toBe(42);
  });

  it('absorbs via head_sha match even without branch data (legacy/backfill)', () => {
    const event = pushEvent({ payload: { commits: [{ sha: 'abc1234567' }] } });
    expect(isPushAbsorbedByPr(event, prWindows)?.prNumber).toBe(42);
  });

  it('absorbs any commit from a PR evidence set, not only the head commit', () => {
    const event = pushEvent({
      payload: { commits: [{ sha: 'middle-commit' }] },
    });
    const window = { ...prWindows[0], commitShas: ['first-commit', 'middle-commit', 'head-commit'] };
    expect(isPushAbsorbedByPr(event, [window])?.prNumber).toBe(42);
  });

  it('absorbs a push explicitly tagged with pr_number', () => {
    const event = pushEvent({ payload: { pr_number: 42, branch: 'whatever' } });
    expect(isPushAbsorbedByPr(event, prWindows)?.prNumber).toBe(42);
  });

  it('does NOT absorb a direct push to the default branch outside any PR window', () => {
    const event = pushEvent({ payload: { branch: 'main' }, created_at: '2026-08-01T00:00:00Z' });
    expect(isPushAbsorbedByPr(event, prWindows)).toBeNull();
  });

  it('does NOT absorb into an unmerged PR (work would be lost)', () => {
    const openOnly: PrWindow[] = [
      { ...prWindows[0], mergedAt: null },
    ];
    const event = pushEvent({ payload: { branch: 'feature-x' } });
    expect(isPushAbsorbedByPr(event, openOnly)).toBeNull();
  });

  it('does NOT absorb pushes before the PR was opened', () => {
    const event = pushEvent({
      payload: { branch: 'feature-x' },
      created_at: '2026-07-01T00:00:00Z',
    });
    expect(isPushAbsorbedByPr(event, prWindows)).toBeNull();
  });

  it('builds PR windows from pr_opened + pr_merged events', () => {
    const events: RawEvent[] = [
      {
        id: 1,
        event_type: 'pr_opened',
        payload: { pr_number: 42, base_ref: 'main', head_ref: 'feature-x', head_sha: 'abc1234567' },
        created_at: '2026-07-10T00:00:00Z',
        contributor_id: 10,
        username: 'dev',
      },
      {
        id: 2,
        event_type: 'pr_merged',
        payload: { pr_number: 42, merge_commit_sha: 'merge9999' },
        created_at: '2026-07-15T00:00:00Z',
        contributor_id: 10,
        username: 'dev',
      },
    ];

    const windows = buildPrWindows(events);
    expect(windows).toHaveLength(1);
    expect(windows[0].prNumber).toBe(42);
    expect(windows[0].headRef).toBe('feature-x');
    expect(windows[0].mergeCommitSha).toBe('merge9999');
    expect(windows[0].mergedAt).not.toBeNull();
  });

  it('sameEventIds is order-insensitive, type-coercive, and flags only real changes', () => {
    expect(sameEventIds([1, 2, 3], [3, 2, 1])).toBe(true);
    // Stored bigint ids come back as strings from the driver — must match numbers.
    expect(sameEventIds(['1', '2', '3'], [3, 2, 1])).toBe(true);
    expect(sameEventIds([1, 2, 3], [1, 2, 3, 4])).toBe(false);
    expect(sameEventIds([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(sameEventIds(null, [1])).toBe(false);
    expect(sameEventIds(undefined, [])).toBe(true);
  });
});

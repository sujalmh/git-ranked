import { describe, expect, it } from 'vitest';
import { buildCorrelationKey } from '../aggregator';
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

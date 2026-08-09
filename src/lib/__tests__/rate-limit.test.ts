import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockSql = vi.fn();
vi.mock('../db', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
}));

import { acquireSlot, consumeDailySlot } from '../rate-limit';

describe('rate-limit acquireSlot', () => {
  beforeEach(() => {
    mockSql.mockClear();
  });

  it('acquires slot immediately when the atomic upsert returns a row', async () => {
    mockSql.mockResolvedValueOnce([{ count: 1 }]);

    await expect(acquireSlot('test-key', 120)).resolves.toBeUndefined();
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it('retries until slot is acquired when the upsert returns no row (window full)', async () => {
    // Attempt 1: window full -> no row returned from the upsert
    mockSql.mockResolvedValueOnce([]);
    // Wait computation reads the current window (resets ~200ms from now)
    mockSql.mockResolvedValueOnce([{ window_start: new Date(Date.now() - 59_800) }]);
    // Attempt 2: slot claimed
    mockSql.mockResolvedValueOnce([{ count: 2 }]);

    await expect(acquireSlot('test-key', 120)).resolves.toBeUndefined();
    expect(mockSql).toHaveBeenCalledTimes(3);
  });
});

describe('rate-limit consumeDailySlot', () => {
  beforeEach(() => {
    mockSql.mockClear();
  });

  it('allows the first consumption in a 24h window', async () => {
    mockSql.mockResolvedValueOnce([{ count: 1 }]);

    const result = await consumeDailySlot('analysis:1', 1);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  it('denies a second consumption when the window is full', async () => {
    // Upsert returns no row (window full) -> read the window to compute retry
    mockSql.mockResolvedValueOnce([]);
    const windowStart = new Date(Date.now() - 60_000);
    mockSql.mockResolvedValueOnce([{ window_start: windowStart }]);

    const result = await consumeDailySlot('analysis:1', 1);
    expect(result.allowed).toBe(false);
    // ~23h remaining until the window rolls over
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(86_400_000);
  });

  it('fails open on unexpected DB errors so analysis is never blocked', async () => {
    mockSql.mockRejectedValueOnce(new Error('db down'));

    const result = await consumeDailySlot('analysis:1', 1);
    expect(result.allowed).toBe(true);
  });
});

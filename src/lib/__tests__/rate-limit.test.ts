import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockSql = vi.fn();
vi.mock('../db', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
}));

import { acquireSlot } from '../rate-limit';

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

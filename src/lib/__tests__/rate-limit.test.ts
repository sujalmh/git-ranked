import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  sql: vi.fn(),
}));

import { acquireSlot } from '../rate-limit';
import { sql } from '../db';

describe('rate-limit acquireSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acquires slot immediately when database returns acquired = true', async () => {
    (sql as any).mockResolvedValueOnce([{ acquired: true, wait_ms: 0 }]);

    await expect(acquireSlot('test-key', 120)).resolves.toBeUndefined();
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('retries until slot is acquired when database initially returns acquired = false', async () => {
    (sql as any)
      .mockResolvedValueOnce([{ acquired: false, wait_ms: 50 }])
      .mockResolvedValueOnce([{ acquired: true, wait_ms: 0 }]);

    await expect(acquireSlot('test-key', 120)).resolves.toBeUndefined();
    expect(sql).toHaveBeenCalledTimes(2);
  });
});

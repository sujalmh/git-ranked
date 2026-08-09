import { sql } from './db';

/**
 * Acquire a rate limit slot for a given key in a Postgres-backed fixed window rate limiter.
 * Window duration is 1 minute. Callers block until a slot is acquired.
 *
 * The slot claim is atomic: the ON CONFLICT ... WHERE gate is evaluated inside
 * the single statement, so concurrent callers cannot both read a stale count and
 * both be admitted (the previous implementation decided from a snapshot of the
 * pre-update row, which allowed over-admission under concurrency).
 */
export async function acquireSlot(
  key = 'openrouter',
  maxRpm = Number(process.env.RATE_LIMIT_RPM) || 600
): Promise<void> {
  while (true) {
    try {
      // Returns a row iff a slot was actually claimed:
      // - fresh insert (first request in window) → count = 1
      // - expired window → count reset to 1
      // - window current and count < max → count incremented
      // If the window is current and full, the WHERE gate rejects the update and
      // no row is returned.
      const rows = await sql<{ count: number }>`
        INSERT INTO rate_limit_bucket (key, window_start, count, updated_at)
        VALUES (${key}, NOW(), 1, NOW())
        ON CONFLICT (key) DO UPDATE
        SET
          window_start = CASE
            WHEN rate_limit_bucket.window_start <= NOW() - INTERVAL '1 minute' THEN NOW()
            ELSE rate_limit_bucket.window_start
          END,
          count = CASE
            WHEN rate_limit_bucket.window_start <= NOW() - INTERVAL '1 minute' THEN 1
            ELSE rate_limit_bucket.count + 1
          END,
          updated_at = NOW()
        WHERE rate_limit_bucket.window_start <= NOW() - INTERVAL '1 minute'
           OR rate_limit_bucket.count < ${maxRpm}
        RETURNING count
      `;

      if (rows.length > 0) {
        return;
      }

      // Window is full. Wait until the current window rolls over.
      const bucket = await sql<{ window_start: string | Date }>`
        SELECT window_start FROM rate_limit_bucket WHERE key = ${key}
      `;

      let waitMs = 1000;
      if (bucket.length > 0) {
        const windowStart = new Date(bucket[0].window_start).getTime();
        waitMs = windowStart + 60_000 - Date.now();
      }
      // Sleep for a portion of the window wait time (capped between 200ms and 2000ms for safety)
      const sleepTime = Math.min(Math.max(waitMs, 200), 2000);
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
    } catch (err) {
      console.error(`[RateLimiter] Error acquiring slot for key '${key}':`, err);
      // Back off briefly on error before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Try to consume one daily quota slot for a key. Unlike acquireSlot this does
 * NOT block: it returns whether the request is allowed right now. The window is
 * a fixed 24-hour period keyed per authenticated account (e.g. analysis runs).
 *
 * Returns { allowed, retryAfterMs } — retryAfterMs is 0 when allowed, otherwise
 * the ms until the current 24h window rolls over.
 */
export async function consumeDailySlot(
  key: string,
  maxPerDay = 1
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  try {
    const rows = await sql<{ count: number }>`
      INSERT INTO rate_limit_bucket (key, window_start, count, updated_at)
      VALUES (${key}, NOW(), 1, NOW())
      ON CONFLICT (key) DO UPDATE
      SET
        window_start = CASE
          WHEN rate_limit_bucket.window_start <= NOW() - INTERVAL '1 day' THEN NOW()
          ELSE rate_limit_bucket.window_start
        END,
        count = CASE
          WHEN rate_limit_bucket.window_start <= NOW() - INTERVAL '1 day' THEN 1
          ELSE rate_limit_bucket.count + 1
        END,
        updated_at = NOW()
      WHERE rate_limit_bucket.window_start <= NOW() - INTERVAL '1 day'
         OR rate_limit_bucket.count < ${maxPerDay}
      RETURNING count
    `;

    if (rows.length > 0) {
      return { allowed: true, retryAfterMs: 0 };
    }

    const bucket = await sql<{ window_start: string | Date }>`
      SELECT window_start FROM rate_limit_bucket WHERE key = ${key}
    `;
    const retryAfterMs =
      bucket.length > 0
        ? Math.max(0, new Date(bucket[0].window_start).getTime() + 86_400_000 - Date.now())
        : 86_400_000;

    return { allowed: false, retryAfterMs };
  } catch (err) {
    console.error(`[RateLimiter] consumeDailySlot error for key '${key}':`, err);
    // Fail-open on unexpected errors so a limiter bug never blocks legitimate analysis.
    return { allowed: true, retryAfterMs: 0 };
  }
}

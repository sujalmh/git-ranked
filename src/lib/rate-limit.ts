import { sql } from './db';

/**
 * Acquire a rate limit slot for a given key in a Postgres-backed fixed window rate limiter.
 * Window duration is 1 minute. Callers block until a slot is acquired.
 */
export async function acquireSlot(
  key = 'openrouter',
  maxRpm = Number(process.env.RATE_LIMIT_RPM) || 600
): Promise<void> {
  while (true) {
    try {
      const rows = await sql<{
        acquired: boolean;
        wait_ms: number;
      }>`
        WITH current_bucket AS (
          SELECT window_start, count FROM rate_limit_bucket WHERE key = ${key}
        ),
        updated AS (
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
              WHEN rate_limit_bucket.count < ${maxRpm} THEN rate_limit_bucket.count + 1
              ELSE rate_limit_bucket.count
            END,
            updated_at = NOW()
          RETURNING window_start, count
        )
        SELECT
          CASE
            WHEN c.window_start IS NULL THEN true
            WHEN c.window_start <= NOW() - INTERVAL '1 minute' THEN true
            WHEN c.count < ${maxRpm} THEN true
            ELSE false
          END AS acquired,
          COALESCE(
            GREATEST(
              200,
              CAST(EXTRACT(EPOCH FROM (COALESCE(c.window_start, NOW()) + INTERVAL '1 minute' - NOW())) * 1000 AS INTEGER)
            ),
            1000
          ) AS wait_ms
        FROM updated u
        LEFT JOIN current_bucket c ON true
      `;

      if (rows.length > 0 && rows[0].acquired) {
        return;
      }

      const waitMs = rows.length > 0 && typeof rows[0].wait_ms === 'number' ? rows[0].wait_ms : 1000;
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

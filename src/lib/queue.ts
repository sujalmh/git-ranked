import { PgBoss } from 'pg-boss';
import { sql } from './db';

let bossInstance: PgBoss | null = null;
let bossInitPromise: Promise<PgBoss> | null = null;

function getConnectionString(): string {
  const url =
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL_DIRECT ||
    process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is not defined in the environment');
  }
  return url;
}

export async function getBoss(): Promise<PgBoss> {
  if (bossInstance) {
    return bossInstance;
  }

  if (bossInitPromise) {
    return bossInitPromise;
  }

  bossInitPromise = (async () => {
    const connectionString = getConnectionString();
    const boss = new PgBoss({
      connectionString,
      schema: 'pgboss',
    });

    boss.on('error', (err: unknown) => {
      console.error('[pg-boss] Error:', err);
    });

    await boss.start();
    await boss.createQueue('classify-repo').catch(() => {});
    bossInstance = boss;
    return boss;
  })();

  return bossInitPromise;
}

export async function enqueueClassifyRepo(
  repoId: number,
  userId?: number
): Promise<string> {
  const boss = await getBoss();
  const singletonKey = `classify-repo-${repoId}`;

  // Never persist the user's OpenRouter API key in the pg-boss payload (DB at
  // rest). The worker resolves the user's AI config from app_users at run time.
  const payload = {
    repoId,
    userId: typeof userId === 'number' && Number.isInteger(userId) ? userId : null,
  };

  const jobId = await boss.send('classify-repo', payload, {
    singletonKey,
    retryLimit: 2,
    expireInSeconds: 21600,
  });

  if (!jobId) {
    // Singleton hit: job already exists and is active. Look up active job_progress row.
    const activeRows = await sql<{ job_id: string }>`
      SELECT job_id
      FROM job_progress
      WHERE repo_id = ${repoId} AND status IN ('queued', 'running')
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    if (activeRows.length > 0 && activeRows[0].job_id) {
      return activeRows[0].job_id;
    }

    // Fallback: send without singleton key if no active job_progress row was found
    const fallbackJobId = await boss.send('classify-repo', payload, {
      retryLimit: 2,
      expireInSeconds: 21600,
    });

    if (fallbackJobId) {
      await sql`
        INSERT INTO job_progress (job_id, repo_id, done, total, status, updated_at)
        VALUES (${fallbackJobId}, ${repoId}, 0, 0, 'queued', NOW())
        ON CONFLICT (job_id) DO UPDATE SET status = 'queued', updated_at = NOW()
      `;
      return fallbackJobId;
    }

    throw new Error(`Failed to enqueue classify-repo job for repo ${repoId}`);
  }

  // Seed job_progress row
  await sql`
    INSERT INTO job_progress (job_id, repo_id, done, total, status, updated_at)
    VALUES (${jobId}, ${repoId}, 0, 0, 'queued', NOW())
    ON CONFLICT (job_id) DO UPDATE SET status = 'queued', updated_at = NOW()
  `;

  return jobId;
}

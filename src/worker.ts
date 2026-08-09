import 'dotenv/config';
import { getBoss } from './lib/queue';
import { classifyRepo } from './lib/scoring';
import { sql } from './lib/db';
import { getUserAiConfig } from './lib/ai/openrouter';
import type { Job } from 'pg-boss';

type ClassifyRepoData = {
  repoId: number;
  userId?: number | null;
};

async function main() {
  const boss = await getBoss();
  const teamConcurrency = Number(process.env.CLASSIFY_TEAM_CONCURRENCY) || 4;

  console.log(`[Worker] Starting pg-boss worker with teamConcurrency = ${teamConcurrency}...`);

  await boss.work<ClassifyRepoData>(
    'classify-repo',
    { localConcurrency: teamConcurrency },
    async (jobOrJobs: Job<ClassifyRepoData> | Job<ClassifyRepoData>[]) => {
      const jobs = Array.isArray(jobOrJobs) ? jobOrJobs : [jobOrJobs];
      for (const job of jobs) {
        const { id: jobId, data } = job;
        const repoId = Number(data.repoId);
        // Resolve the user's AI config from the DB at run time so the API key is
        // never stored in the job payload (it is read here, not persisted).
        const userId = typeof data?.userId === 'number' ? data.userId : undefined;
        const aiOptions = userId !== undefined ? await getUserAiConfig(userId) : undefined;

        console.log(`[Worker] Processing job ${jobId} for repo ${repoId}`);

        // Update status to running
        await sql`
          UPDATE job_progress
          SET status = 'running', updated_at = NOW()
          WHERE job_id = ${jobId}
        `;

        try {
          const resultUnits = await classifyRepo(repoId, aiOptions, { jobId });

          // Update status to completed and ensure done = total
          await sql`
            UPDATE job_progress
            SET status = 'completed',
                done = total,
                result_units = ${resultUnits},
                updated_at = NOW()
            WHERE job_id = ${jobId}
          `;

          console.log(`[Worker] Job ${jobId} for repo ${repoId} completed with ${resultUnits} units.`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`[Worker] Job ${jobId} for repo ${repoId} failed:`, errorMessage);

          await sql`
            UPDATE job_progress
            SET status = 'failed',
                error = ${errorMessage},
                updated_at = NOW()
            WHERE job_id = ${jobId}
          `;

          throw err;
        }
      }
    }
  );

  // Granularity refinement — the feed-backward quality job. Runs after
  // extraction to split over-broad work units, offline from the analyse path.
  await boss.work<ClassifyRepoData>(
    'granularity-refine',
    { localConcurrency: 2 },
    async (jobOrJobs: Job<ClassifyRepoData> | Job<ClassifyRepoData>[]) => {
      const jobs = Array.isArray(jobOrJobs) ? jobOrJobs : [jobOrJobs];
      for (const job of jobs) {
        const { id: jobId, data } = job;
        const repoId = Number(data.repoId);
        const userId = typeof data?.userId === 'number' ? data.userId : undefined;
        const aiOptions = userId !== undefined ? await getUserAiConfig(userId) : undefined;

        console.log(`[Worker] Granularity-refine job ${jobId} for repo ${repoId}`);
        try {
          const { runRepoRefinementQuality } = await import('./lib/scoring');
          const result = await runRepoRefinementQuality(repoId, aiOptions);
          console.log(`[Worker] Granularity-refine job ${jobId} for repo ${repoId}: ${result.enqueued} enqueued, ${result.refined} refined.`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`[Worker] Granularity-refine job ${jobId} for repo ${repoId} failed:`, errorMessage);
          throw err;
        }
      }
    }
  );
}

const shutdown = async (signal: string) => {
  console.log(`[Worker] Received ${signal}, stopping pg-boss worker...`);
  try {
    const boss = await getBoss();
    await boss.stop({ graceful: true });
  } catch (err) {
    console.error('[Worker] Error during shutdown:', err);
  } finally {
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  console.error('[Worker] Fatal error starting worker:', err);
  process.exit(1);
});

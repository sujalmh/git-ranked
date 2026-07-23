import 'dotenv/config';
import { getBoss } from './lib/queue';
import { classifyRepo } from './lib/scoring';
import { sql } from './lib/db';

async function main() {
  const boss = await getBoss();
  const teamConcurrency = Number(process.env.CLASSIFY_TEAM_CONCURRENCY) || 4;

  console.log(`[Worker] Starting pg-boss worker with teamConcurrency = ${teamConcurrency}...`);

  await boss.work(
    'classify-repo',
    { localConcurrency: teamConcurrency },
    async (jobOrJobs: any) => {
      const jobs = Array.isArray(jobOrJobs) ? jobOrJobs : [jobOrJobs];
      for (const job of jobs) {
        const { id: jobId, data } = job;
        const repoId = Number(data.repoId);
        const apiKey = typeof data?.apiKey === 'string' ? data.apiKey : undefined;
        const model = typeof data?.model === 'string' ? data.model : undefined;
        const aiOptions = { apiKey, model };

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

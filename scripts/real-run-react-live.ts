import 'dotenv/config';
import { sql } from '../src/lib/db';
import { backfillRepoActivity } from '../src/lib/github-backfill';
import { aggregateRepoCandidates } from '../src/lib/scoring/aggregator';
import { enqueueClassifyRepo } from '../src/lib/queue';
import { scoreRepo } from '../src/lib/scoring';

async function main() {
  console.log('================================================================');
  console.log('REAL BACKFILL & CLASSIFICATION RUN FOR facebook/react ON GCP');
  console.log('================================================================\n');

  // 1. Ensure repo row exists
  const existing = await sql`
    SELECT id FROM repositories WHERE owner = 'facebook' AND name = 'react'
  `;
  
  let repoId: number;
  if (existing.length > 0) {
    repoId = existing[0].id;
  } else {
    const inserted = await sql`
      INSERT INTO repositories (github_repo_id, owner, name, default_branch, is_active)
      VALUES (10270250, 'facebook', 'react', 'main', true)
      RETURNING id
    `;
    repoId = inserted[0].id;
  }

  console.log(`Repository: facebook/react (Repo ID: ${repoId})`);

  // 2. Fetch real data from GitHub API
  console.log('\n--- Step 1: Fetching Real GitHub Activity via GitHub REST API ---');

  // Prefer an installation token (set GITHUB_INSTALLATION_ID) or the
  // GITHUB_TOKEN; otherwise this falls back to unauthenticated GitHub API,
  // which is heavily rate-limited for facebook/react.
  const installationId = process.env.GITHUB_INSTALLATION_ID
    ? Number(process.env.GITHUB_INSTALLATION_ID)
    : undefined;
  if (!installationId) {
    console.warn('GITHUB_INSTALLATION_ID not set — backfill will be unauthenticated (rate-limited).');
  }

  const backfillResult = await backfillRepoActivity(
    {
      id: repoId,
      github_installation_id: installationId || 0,
      owner: 'facebook',
      name: 'react',
    },
    process.env.GITHUB_TOKEN
  );
  console.log(`Inserted ${backfillResult.inserted} real events into Neon DB.`);

  // 3. Aggregate work unit candidates
  console.log('\n--- Step 2: Aggregating Work Unit Candidates ---');
  const candidates = await aggregateRepoCandidates(repoId);
  console.log(`Generated ${candidates.length} work unit candidates from real events.`);

  if (candidates.length === 0) {
    console.log('No candidates generated. Exiting.');
    process.exit(0);
  }

  // 4. Reset this repo's candidates so they undergo fresh classification.
  // NOTE: do NOT wipe classification_cache globally — it is shared across
  // repos, and content-hash hits simply reuse prior AI answers.
  await sql`DELETE FROM work_units WHERE repo_id = ${repoId}`;
  await sql`
    UPDATE work_unit_candidates
    SET status = 'pending', classified_at = NULL
    WHERE repo_id = ${repoId}
  `;

  // 5. Enqueue classification job to GCP pg-boss worker
  console.log('\n--- Step 3: Enqueuing Classification Job to GCP Worker ---');
  const startTime = Date.now();
  const jobId = await enqueueClassifyRepo(repoId);
  console.log(`Job enqueued! Job ID: ${jobId}`);

  // 6. Monitor job progress in real-time
  console.log('Monitoring live worker execution on GCP...');
  let lastProgressStr = '';
  const JOB_POLL_TIMEOUT_MS = 30 * 60 * 1000;
  const monitorStart = Date.now();

  while (true) {
    if (Date.now() - monitorStart > JOB_POLL_TIMEOUT_MS) {
      throw new Error(`Worker job ${jobId} did not finish within 30 minutes`);
    }

    const rows = await sql<{
      status: string;
      done: number;
      total: number;
      result_units: number | null;
      error: string | null;
    }>`
      SELECT status, done, total, result_units, error
      FROM job_progress
      WHERE job_id = ${jobId}
    `;

    if (rows.length > 0) {
      const job = rows[0];
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const progressStr = `[${elapsed}s] Status: ${job.status} | Progress: ${job.done}/${job.total}`;
      
      if (progressStr !== lastProgressStr) {
        console.log(`  ${progressStr}`);
        lastProgressStr = progressStr;
      }

      if (job.status === 'completed') {
        break;
      }
      if (job.status === 'failed') {
        throw new Error(`Worker job failed: ${job.error}`);
      }
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  const totalTimeSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

  // 7. Compute scoring
  console.log('\n--- Step 4: Computing Contributor Dimension Scores ---');
  const scores = await scoreRepo(repoId);
  console.log(`Computed ${scores.length} contributor dimension score rows.`);

  // 8. Query final candidate breakdown (passed vs failed)
  const candidateStats = await sql<{ status: string; count: number }>`
    SELECT status, COUNT(*)::int as count
    FROM work_unit_candidates
    WHERE repo_id = ${repoId}
    GROUP BY status
  `;

  const workUnits = await sql<{
    id: number;
    work_type: string;
    summary: string;
    extraction_source: string;
    extraction_confidence: number;
    username: string;
  }>`
    SELECT wu.id, wu.work_type, wu.summary, wu.extraction_source, wu.extraction_confidence, c.username
    FROM work_units wu
    JOIN work_unit_contributors wuc ON wu.id = wuc.work_unit_id
    JOIN github_contributors c ON wuc.contributor_id = c.id
    WHERE wu.repo_id = ${repoId}
    ORDER BY wu.created_at DESC
  `;

  const passedCount = candidateStats.find((s) => s.status === 'classified')?.count ?? 0;
  const pendingCount = candidateStats.find((s) => s.status === 'pending' || s.status === 'needs_reclassification')?.count ?? 0;

  console.log('\n' + '='.repeat(80));
  console.log('REAL RUN SUMMARY FOR facebook/react');
  console.log('=' .repeat(80));
  console.log(`Job ID:                     ${jobId}`);
  console.log(`Total Real Events Ingested: ${backfillResult.inserted}`);
  console.log(`Total Candidates:           ${candidates.length}`);
  console.log(`Candidates Classified:      ${passedCount} (PASSED)`);
  console.log(`Candidates Failed/Pending:  ${pendingCount} (FAILED)`);
  console.log(`Extracted Work Units:       ${workUnits.length}`);
  console.log(`Total Execution Time:       ${totalTimeSeconds} seconds`);
  console.log('-'.repeat(80));

  console.log('\nSample Extracted Work Units (Top 10):');
  for (const unit of workUnits.slice(0, 10)) {
    console.log(`  • [${unit.work_type}] ${unit.summary}`);
    console.log(`    (Contributor: ${unit.username} | Source: ${unit.extraction_source} | Confidence: ${Math.round(unit.extraction_confidence * 100)}%)`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('REAL RUN COMPLETE!');
  console.log('='.repeat(80) + '\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\nReal run failed:', err);
  process.exit(1);
});

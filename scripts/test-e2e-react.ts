import 'dotenv/config';
import { sql } from '../src/lib/db';
import { enqueueClassifyRepo } from '../src/lib/queue';
import { scoreRepo } from '../src/lib/scoring';

async function main() {
  console.log('=== Starting End-to-End Setup Test for react/react ===\n');

  // 1. Ensure repo exists
  const existingRepo = await sql`
    SELECT id FROM repositories WHERE owner = 'facebook' AND name = 'react'
  `;

  let repoId: number;
  if (existingRepo.length > 0) {
    repoId = existingRepo[0].id;
    console.log(`Using existing repository ID: ${repoId} (facebook/react)`);
  } else {
    const insertedRepo = await sql`
      INSERT INTO repositories (github_repo_id, owner, name, default_branch, is_active)
      VALUES (10270250, 'facebook', 'react', 'main', true)
      RETURNING id
    `;
    repoId = insertedRepo[0].id;
    console.log(`Created repository ID: ${repoId} (facebook/react)`);
  }

  // 2. Ensure test contributors exist. Use implausibly high fake github_ids so
  // we never clobber a real early-GitHub user (ids ~10000+ are real accounts),
  // and DO NOTHING on conflict so an existing row's username is preserved.
  const FAKE_GITHUB_ID_A = 9_000_000_001;
  const FAKE_GITHUB_ID_B = 9_000_000_002;

  await sql`
    INSERT INTO github_contributors (github_id, username)
    VALUES (${FAKE_GITHUB_ID_A}, 'gaearon')
    ON CONFLICT (github_id) DO NOTHING
  `;
  await sql`
    INSERT INTO github_contributors (github_id, username)
    VALUES (${FAKE_GITHUB_ID_B}, 'acdlite')
    ON CONFLICT (github_id) DO NOTHING
  `;

  const contrib1 = await sql`SELECT id FROM github_contributors WHERE github_id = ${FAKE_GITHUB_ID_A}`;
  const contrib2 = await sql`SELECT id FROM github_contributors WHERE github_id = ${FAKE_GITHUB_ID_B}`;

  const gaearonId = contrib1[0].id;
  const acdliteId = contrib2[0].id;

  // 3. Clear existing candidates & units for clean test run
  await sql`DELETE FROM work_unit_contributors WHERE work_unit_id IN (SELECT id FROM work_units WHERE repo_id = ${repoId})`;
  await sql`DELETE FROM work_units WHERE repo_id = ${repoId}`;
  await sql`DELETE FROM work_unit_candidates WHERE repo_id = ${repoId}`;
  await sql`DELETE FROM github_events WHERE repo_id = ${repoId}`;
  await sql`DELETE FROM job_progress WHERE repo_id = ${repoId}`;

  // 4. Seed github_events for react/react
  console.log('Seeding GitHub events for react/react...');
  
  const sampleEvents = [
    {
      repo_id: repoId,
      contributor_id: gaearonId,
      event_type: 'pr_merged',
      payload: JSON.stringify({
        pr_number: 28001,
        title: 'Add React 19 Concurrent Renderer Optimizations and Fiber Reconciliation',
        body: 'Implements Fiber batching and priority scheduling for dynamic components.',
        additions: 350,
        deletions: 120,
        changed_files: 14,
        commit_count: 5,
      }),
      github_event_id: 'evt_react_28001',
    },
    {
      repo_id: repoId,
      contributor_id: acdliteId,
      event_type: 'pr_merged',
      payload: JSON.stringify({
        pr_number: 28002,
        title: 'Fix Server Action mutation re-render race condition in Suspense hydration',
        body: 'Resolves stale state edge case when server actions mutate data during hydration.',
        additions: 45,
        deletions: 12,
        changed_files: 3,
        commit_count: 2,
      }),
      github_event_id: 'evt_react_28002',
    },
    {
      repo_id: repoId,
      contributor_id: gaearonId,
      event_type: 'review_submitted',
      payload: JSON.stringify({
        pr_number: 28002,
        state: 'approved',
        word_count: 45,
        body: 'Thorough review of hydration semantics. Tests pass cleanly.',
      }),
      github_event_id: 'evt_react_rev_28002',
    },
    {
      repo_id: repoId,
      contributor_id: acdliteId,
      event_type: 'push',
      payload: JSON.stringify({
        head_sha: 'a1b2c3d4e5f678901234567890abcdef12345678',
        after: 'a1b2c3d4e5f678901234567890abcdef12345678',
        commit_count: 2,
        commits: [
          { message: 'Update React Compiler transform pass for memoized JSX hooks', additions: 80, deletions: 10 },
          { message: 'Add unit tests for memoization transform', additions: 40, deletions: 0 }
        ]
      }),
      github_event_id: 'evt_react_push_001',
    }
  ];

  for (const evt of sampleEvents) {
    await sql`
      INSERT INTO github_events (repo_id, contributor_id, event_type, payload, github_event_id, created_at)
      VALUES (${evt.repo_id}, ${evt.contributor_id}, ${evt.event_type}, ${evt.payload}::jsonb, ${evt.github_event_id}, NOW())
    `;
  }
  console.log(`  Seeded ${sampleEvents.length} events.`);

  // 5. Enqueue classification job
  console.log('\nEnqueuing classification job via pg-boss...');
  const startTime = Date.now();
  const jobId = await enqueueClassifyRepo(repoId);
  console.log(`  Enqueued! Job ID: ${jobId}`);

  // 6. Poll job_progress until completed/failed
  console.log('Polling worker job progress on GCP background worker...');
  let status = 'queued';
  let done = 0;
  let total = 0;
  let resultUnits = 0;
  let error: string | null = null;
  const JOB_POLL_TIMEOUT_MS = 30 * 60 * 1000;

  while (true) {
    if (Date.now() - startTime > JOB_POLL_TIMEOUT_MS) {
      throw new Error(`Worker job ${jobId} did not finish within 30 minutes`);
    }

    const progress = await sql`
      SELECT status, done, total, result_units, error, updated_at
      FROM job_progress
      WHERE job_id = ${jobId}
    `;

    if (progress.length > 0) {
      const p = progress[0];
      status = p.status;
      done = Number(p.done || 0);
      total = Number(p.total || 0);
      resultUnits = p.result_units ?? 0;
      error = p.error ?? null;

      const elapsedMs = Date.now() - startTime;
      console.log(`  [${(elapsedMs / 1000).toFixed(1)}s] Status: ${status} | Progress: ${done}/${total}`);

      if (status === 'completed') {
        break;
      }
      if (status === 'failed') {
        throw new Error(`Worker job failed: ${error}`);
      }
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  const durationMs = Date.now() - startTime;
  console.log(`\nJob completed in ${(durationMs / 1000).toFixed(2)} seconds!`);

  // 7. Run scoring
  console.log('\nComputing contributor dimension scores...');
  const scores = await scoreRepo(repoId);
  console.log(`Computed ${scores.length} score entries.`);

  // 8. Output results summary
  const workUnits = await sql`
    SELECT wu.id, wu.work_type, wu.summary, wu.extraction_source, wu.extraction_confidence, c.username
    FROM work_units wu
    JOIN work_unit_contributors wuc ON wu.id = wuc.work_unit_id
    JOIN github_contributors c ON wuc.contributor_id = c.id
    WHERE wu.repo_id = ${repoId}
    ORDER BY wu.created_at DESC
  `;

  console.log('\n' + '='.repeat(80));
  console.log('E2E TEST RESULTS FOR react/react');
  console.log('='.repeat(80));
  console.log(`Job ID:                   ${jobId}`);
  console.log(`Status:                   ${status}`);
  console.log(`Total Time Taken:         ${(durationMs / 1000).toFixed(2)} seconds`);
  console.log(`Total Candidates:         ${total}`);
  console.log(`Extracted Work Units:     ${resultUnits}`);
  console.log('-'.repeat(80));

  console.log('Extracted Work Units Detail:');
  for (const unit of workUnits) {
    console.log(`  • [${unit.work_type}] ${unit.summary} (Contributor: ${unit.username}, Source: ${unit.extraction_source}, Confidence: ${Math.round(unit.extraction_confidence * 100)}%)`);
  }

  console.log('-'.repeat(80));
  console.log('Dimension Scores Detail:');
  for (const s of scores) {
    console.log(`  • Contributor ${s.contributor_id} (${s.decay_profile}): Composite=${s.composite.toFixed(2)}, Impact=${s.impact.toFixed(2)}, Quality=${s.quality.toFixed(2)}, Consistency=${s.consistency.toFixed(2)}`);
  }

  console.log('='.repeat(80));
  console.log('Test completed successfully!\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nE2E Test Failed:', err);
  process.exit(1);
});

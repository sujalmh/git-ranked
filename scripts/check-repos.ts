import 'dotenv/config';
import { sql } from '../src/lib/db';

async function main() {
  const repos = await sql`SELECT id, owner, name, default_branch, added_at FROM repositories`;
  console.log('Repositories in Neon DB:', JSON.stringify(repos, null, 2));

  const candidates = await sql`SELECT repo_id, status, COUNT(*) as count FROM work_unit_candidates GROUP BY repo_id, status`;
  console.log('Candidates summary:', JSON.stringify(candidates, null, 2));

  const jobs = await sql`SELECT * FROM job_progress ORDER BY updated_at DESC LIMIT 10`;
  console.log('Job progress rows:', JSON.stringify(jobs, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

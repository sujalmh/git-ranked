import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const [owner, name] = process.argv.slice(2);
  if (!owner || !name) {
    console.error('Usage: npx tsx src/scripts/reset-repo.ts <owner> <name>');
    console.error('Example: npx tsx src/scripts/reset-repo.ts react react');
    process.exit(1);
  }

  const { sql } = await import('../lib/db');

  const repo = await sql`
    SELECT id FROM repositories WHERE owner = ${owner} AND name = ${name}
  `;
  if (repo.length === 0) {
    console.error(`Repository ${owner}/${name} not found.`);
    process.exit(1);
  }
  const repoId = repo[0].id as number;
  console.log(`Resetting ${owner}/${name} (repo_id=${repoId})…`);

  const aiSummaries = await sql`
    DELETE FROM ai_summaries WHERE repo_id = ${repoId} RETURNING id
  `;
  console.log(`  deleted ${aiSummaries.length} ai_summaries`);

  const insightCaches = await sql`
    DELETE FROM insight_caches WHERE repo_id = ${repoId} RETURNING id
  `;
  console.log(`  deleted ${insightCaches.length} insight_caches (health, profiles, impact)`);

  const events = await sql`
    DELETE FROM github_events WHERE repo_id = ${repoId} RETURNING id
  `;
  console.log(`  deleted ${events.length} github_events`);

  console.log('Done. Re-initialize the repo (Initialize button) to pull deeper history with the new backfill.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to reset repo:', err);
  process.exit(1);
});

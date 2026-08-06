import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const RESET = process.argv.includes('--reset');

async function main() {
  try {
    const { sql, initSchema } = await import('../lib/db');
    const { seedScoringConfigs } = await import('../lib/scoring/seed');

    if (RESET) {
      console.log('WARNING: --reset drops ALL repo data tables (preserving app_users & installations).');
      await sql`DROP TABLE IF EXISTS dimension_scores CASCADE;`;
      await sql`DROP TABLE IF EXISTS work_unit_overrides CASCADE;`;
      await sql`DROP TABLE IF EXISTS work_unit_contributors CASCADE;`;
      await sql`DROP TABLE IF EXISTS work_units CASCADE;`;
      await sql`DROP TABLE IF EXISTS work_unit_candidates CASCADE;`;
      await sql`DROP TABLE IF EXISTS classification_cache CASCADE;`;
      await sql`DROP TABLE IF EXISTS scoring_config CASCADE;`;
      await sql`DROP TABLE IF EXISTS ai_summaries CASCADE;`;
      await sql`DROP TABLE IF EXISTS insight_caches CASCADE;`;
      await sql`DROP TABLE IF EXISTS daily_aggregates CASCADE;`;
      await sql`DROP TABLE IF EXISTS github_events CASCADE;`;
      await sql`DROP TABLE IF EXISTS github_contributors CASCADE;`;
      await sql`DROP TABLE IF EXISTS repositories CASCADE;`;
      console.log('Repo tables dropped successfully.');
    } else {
      console.log('Applying idempotent schema migrations (preserves existing data)...');
    }

    console.log('Re-initializing schema...');
    await initSchema();

    console.log('Seeding scoring configs...');
    await seedScoringConfigs();

    console.log(
      RESET
        ? 'Reset completed successfully! User data (app_users & installations) preserved.'
        : 'Migration completed successfully! Schema is up to date; existing data preserved.'
    );
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();

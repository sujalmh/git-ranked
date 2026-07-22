import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  try {
    const { sql, initSchema } = await import('../lib/db');
    const { seedScoringConfigs } = await import('../lib/scoring/seed');

    console.log('Starting Neon DB migration...');

    // Preserving user info (app_users, installations)
    // Dropping repo-related tables to ensure clean v3 schema application
    console.log('Dropping existing repository data tables (preserving user info & installations)...');
    
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

    console.log('Re-initializing schema...');
    await initSchema();

    console.log('Seeding scoring configs...');
    await seedScoringConfigs();

    console.log('Migration completed successfully! User data (app_users & installations) preserved.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();

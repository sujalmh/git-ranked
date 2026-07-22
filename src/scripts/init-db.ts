import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  try {
    const { initSchema } = await import('../lib/db');
    const { seedScoringConfigs } = await import('../lib/scoring/seed');
    await initSchema();
    await seedScoringConfigs();
    console.log('Successfully initialized schema and seeded scoring configs.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize schema:', error);
    process.exit(1);
  }
}

main();

import 'dotenv/config';
import { initSchema } from '../src/lib/db';
import { seedScoringConfigs } from '../src/lib/scoring/seed';

async function main() {
  console.log('Running initSchema()...');
  await initSchema();
  console.log('Seeding scoring configs...');
  await seedScoringConfigs();
  console.log('Done!');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

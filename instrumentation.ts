export async function register() {
  // Database schema changes are applied explicitly via `npm run db:migrate`.
  // Running initSchema() (60+ DDL statements + a constraint swap) on every
  // serverless cold start slows cold boots and risks ACCESS EXCLUSIVE lock
  // contention under concurrent cold starts. Opt-in via env var if you want a
  // deploy to auto-verify the schema.
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.ENABLE_STARTUP_SCHEMA_INIT === 'true'
  ) {
    try {
      const { initSchema } = await import('./src/lib/db');
      await initSchema();
      console.log('[instrumentation] Database schema verified.');
    } catch (error) {
      console.error('[instrumentation] Database migration failed:', error);
      // Don't crash — the app can still serve cached data. Migration will
      // retry on the next deploy or server restart.
    }
  }
}

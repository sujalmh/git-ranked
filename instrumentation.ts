export async function register() {
  // Run database migrations on server startup so every Vercel deploy
  // auto-applies schema changes without a manual `init-db` run.
  // This is idempotent (uses IF NOT EXISTS / guarded constraint swaps).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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

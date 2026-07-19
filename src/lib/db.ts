import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in the environment');
}

export const sql = neon(process.env.DATABASE_URL);

// Run this once during deployment or manually to create the schema
export async function initSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS app_users (
        id SERIAL PRIMARY KEY,
        github_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        email VARCHAR(255),
        avatar_url VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS github_contributors (
        id SERIAL PRIMARY KEY,
        github_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255) NOT NULL,
        avatar_url VARCHAR(255),
        first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // installations: source of truth is GitHub webhooks.
  // status: 'pending' -> 'active' -> 'deleted'
  // pending: webhook received but no app_user linked yet
  // active: linked to an app_user
  await sql`
    CREATE TABLE IF NOT EXISTS installations (
        id SERIAL PRIMARY KEY,
        github_installation_id BIGINT UNIQUE NOT NULL,
        github_account_id BIGINT NOT NULL,
        owner_login VARCHAR(255) NOT NULL,
        owner_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        linked_user_id INTEGER REFERENCES app_users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // Migrate existing installations table if it has old columns
  await sql`
    ALTER TABLE installations ADD COLUMN IF NOT EXISTS github_account_id BIGINT;
  `.catch(() => {});
  await sql`
    ALTER TABLE installations ADD COLUMN IF NOT EXISTS owner_login VARCHAR(255);
  `.catch(() => {});
  await sql`
    ALTER TABLE installations ADD COLUMN IF NOT EXISTS owner_type VARCHAR(50);
  `.catch(() => {});
  await sql`
    ALTER TABLE installations ADD COLUMN IF NOT EXISTS linked_user_id INTEGER REFERENCES app_users(id);
  `.catch(() => {});
  await sql`
    ALTER TABLE installations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS repositories (
        id SERIAL PRIMARY KEY,
        installation_id INTEGER REFERENCES installations(id),
        github_repo_id BIGINT UNIQUE NOT NULL,
        owner VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        default_branch VARCHAR(255) DEFAULT 'main',
        is_active BOOLEAN DEFAULT true,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS github_events (
        id SERIAL PRIMARY KEY,
        repo_id INTEGER REFERENCES repositories(id),
        contributor_id INTEGER REFERENCES github_contributors(id),
        event_type VARCHAR(50) NOT NULL,
        payload JSONB,
        github_event_id VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ai_summaries (
        id SERIAL PRIMARY KEY,
        repo_id INTEGER REFERENCES repositories(id),
        contributor_id INTEGER REFERENCES github_contributors(id),
        summary_type VARCHAR(50) DEFAULT 'weekly',
        date_from DATE NOT NULL,
        date_to DATE NOT NULL,
        summary_text TEXT NOT NULL,
        model_used VARCHAR(255),
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // Migrate existing ai_summaries table if it has old columns
  await sql`
    ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS summary_type VARCHAR(50) DEFAULT 'weekly';
  `.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS insight_caches (
        id SERIAL PRIMARY KEY,
        repo_id INTEGER REFERENCES repositories(id),
        insight_type VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (repo_id, insight_type)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_aggregates (
        id SERIAL PRIMARY KEY,
        repo_id INTEGER REFERENCES repositories(id),
        date DATE NOT NULL,
        metrics JSONB NOT NULL,
        UNIQUE (repo_id, date)
    );
  `;

  // --- Structured AI architecture migrations ---
  // github_events: per-event classification + cached diff facts
  await sql`ALTER TABLE github_events ADD COLUMN IF NOT EXISTS classification JSONB`.catch(() => {});
  await sql`ALTER TABLE github_events ADD COLUMN IF NOT EXISTS classified_at TIMESTAMP`.catch(() => {});
  await sql`ALTER TABLE github_events ADD COLUMN IF NOT EXISTS diff_facts JSONB`.catch(() => {});

  // ai_summaries: structured payload + versioning + confidence + source
  await sql`ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS payload JSONB`.catch(() => {});
  await sql`ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS schema_version VARCHAR(50)`.catch(() => {});
  await sql`ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(50)`.catch(() => {});
  await sql`ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS confidence REAL`.catch(() => {});
  await sql`ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'ai'`.catch(() => {});
  // Mark any legacy rows (pre-rewrite) so structured readers ignore them
  await sql`UPDATE ai_summaries SET schema_version = 'legacy' WHERE schema_version IS NULL`.catch(() => {});

  // insight_caches: support per-contributor profiles/impact + versioning
  await sql`ALTER TABLE insight_caches ADD COLUMN IF NOT EXISTS contributor_id INTEGER REFERENCES github_contributors(id)`.catch(() => {});
  await sql`ALTER TABLE insight_caches ADD COLUMN IF NOT EXISTS schema_version VARCHAR(50)`.catch(() => {});
  await sql`ALTER TABLE insight_caches ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(50)`.catch(() => {});
  await sql`ALTER TABLE insight_caches ADD COLUMN IF NOT EXISTS confidence REAL`.catch(() => {});
  await sql`ALTER TABLE insight_caches ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'deterministic'`.catch(() => {});

  // Swap the unique constraint on insight_caches to allow per-contributor rows.
  // The original schema declares UNIQUE (repo_id, insight_type). Replace with
  // UNIQUE (repo_id, contributor_id, insight_type). Contributor-scoped rows
  // (contributor_id IS NULL) remain repo-scoped.
  await swapInsightCachesConstraint();

  console.log('Database schema initialized.');
}

async function swapInsightCachesConstraint() {
  // Only the original constraint name used by this app's CREATE TABLE.
  const LEGACY_CONSTRAINT_NAME = 'insight_caches_repo_id_insight_type_key';
  const NEW_CONSTRAINT_NAME = 'insight_caches_repo_contributor_type_key';

  const constraintExists = await sql`
    SELECT 1 FROM pg_constraint WHERE conname = ${LEGACY_CONSTRAINT_NAME}
  `;
  if (constraintExists.length === 0) return;

  // Dedupe rows that would collide under the new key, keeping the latest.
  await sql`
    DELETE FROM insight_caches a
    USING insight_caches b
    WHERE a.id < b.id
      AND a.repo_id IS NOT DISTINCT FROM b.repo_id
      AND a.contributor_id IS NOT DISTINCT FROM b.contributor_id
      AND a.insight_type = b.insight_type
  `.catch(() => {});

  // Constraint names are trusted constants, safe to inject as identifiers.
  await sql`ALTER TABLE insight_caches DROP CONSTRAINT ${sql.unsafe(LEGACY_CONSTRAINT_NAME)}`.catch(() => {});
  await sql`ALTER TABLE insight_caches ADD CONSTRAINT ${sql.unsafe(NEW_CONSTRAINT_NAME)} UNIQUE (repo_id, contributor_id, insight_type)`.catch(() => {});
}

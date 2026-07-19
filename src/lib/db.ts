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
        date_from DATE NOT NULL,
        date_to DATE NOT NULL,
        summary_text TEXT NOT NULL,
        model_used VARCHAR(255),
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  console.log('Database schema initialized.');
}

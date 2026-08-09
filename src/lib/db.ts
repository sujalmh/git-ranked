/* eslint-disable @typescript-eslint/no-explicit-any */
import { neon } from '@neondatabase/serverless';

let cachedDbUrl: string | null = null;
let cachedNeonClient: any = null;

function getNeonSql() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not defined in the environment');
  }
  if (!cachedNeonClient || cachedDbUrl !== dbUrl) {
    cachedDbUrl = dbUrl;
    cachedNeonClient = neon(dbUrl);
  }
  return cachedNeonClient;
}

export type SqlFunction = {
  <T = Record<string, any>>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]>;
  unsafe: <T = Record<string, any>>(str: string) => Promise<T[]>;
};

export const sql: SqlFunction = Object.assign(
  (strings: TemplateStringsArray, ...values: any[]) => {
    return getNeonSql()(strings, ...values);
  },
  {
    unsafe: (str: string) => {
      const client = getNeonSql();
      if (typeof client.unsafe === 'function') {
        return client.unsafe(str);
      }
      return client([str] as any);
    },
  }
);

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

  await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS openrouter_api_key TEXT`;
  await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS ai_model VARCHAR(255)`;
  await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS use_custom_key BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS ai_endpoint TEXT`;
  await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(50)`;

  await sql`
    CREATE TABLE IF NOT EXISTS github_contributors (
        id SERIAL PRIMARY KEY,
        github_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255) NOT NULL,
        avatar_url VARCHAR(255),
        email VARCHAR(255),
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

  // email: used to resolve commit authors to contributors for proportional
  // attribution (username and github_id are preferred, email is a fallback).
  await sql`
    ALTER TABLE github_contributors ADD COLUMN IF NOT EXISTS email VARCHAR(255);
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

  // Repo-scoped insight rows (contributor_id IS NULL, e.g. health_metrics) are
  // NOT covered by the (repo_id, contributor_id, insight_type) unique constraint:
  // Postgres treats NULLs as distinct in unique constraints, so repo-scoped
  // writes never conflict and stale rows accumulate (the reader then returns the
  // oldest row). Dedupe to the latest row and enforce one repo-scoped row per
  // (repo_id, insight_type) with a partial unique index.
  await sql`
    DELETE FROM insight_caches a
    USING insight_caches b
    WHERE a.id < b.id
      AND a.repo_id IS NOT DISTINCT FROM b.repo_id
      AND a.contributor_id IS NOT DISTINCT FROM b.contributor_id
      AND a.insight_type = b.insight_type
  `.catch((err: unknown) => {
    console.warn('Failed to dedupe insight_caches:', err instanceof Error ? err.message : err);
  });
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS insight_caches_repo_scoped_idx
    ON insight_caches (repo_id, insight_type) WHERE contributor_id IS NULL
  `.catch((err: unknown) => {
    console.warn('Failed to create repo-scoped insight cache index:', err instanceof Error ? err.message : err);
  });

  // --- Share link migrations ---
  // repositories: share_token for public read-only access, share_enabled toggle
  await sql`ALTER TABLE repositories ADD COLUMN IF NOT EXISTS share_token VARCHAR(32) UNIQUE`.catch(() => {});
  await sql`ALTER TABLE repositories ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN DEFAULT false`.catch(() => {});

  // Public repos added via the "add public repo" flow are scoped to the user
  // who added them (added_by_user_id). Previously ALL public repos
  // (installation_id IS NULL) were considered owned by EVERY user, which let
  // any authenticated user classify/analyse/remove repos others had added.
  await sql`ALTER TABLE repositories ADD COLUMN IF NOT EXISTS added_by_user_id INTEGER REFERENCES app_users(id)`.catch(() => {});

  // --- Scoring System v3 migrations ---
  await sql`ALTER TABLE repositories ADD COLUMN IF NOT EXISTS scoring_profile VARCHAR(24)`.catch(() => {});
  await sql`ALTER TABLE github_events ADD COLUMN IF NOT EXISTS before_sha VARCHAR(40)`.catch(() => {});
  await sql`ALTER TABLE github_events ADD COLUMN IF NOT EXISTS after_sha VARCHAR(40)`.catch(() => {});

  // work_units: summary column for the AI-generated work item description
  await sql`ALTER TABLE work_units ADD COLUMN IF NOT EXISTS summary TEXT`.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS work_unit_candidates (
      id BIGSERIAL PRIMARY KEY,
      repo_id INTEGER NOT NULL REFERENCES repositories(id),
      correlation_key VARCHAR(160) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      source_event_ids BIGINT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      classified_at TIMESTAMPTZ,
      evidence_hash VARCHAR(64),
      extraction_revision INTEGER NOT NULL DEFAULT 0,
      UNIQUE (repo_id, correlation_key)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS wuc_repo_status_idx ON work_unit_candidates(repo_id, status);`.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS work_units (
      id BIGSERIAL PRIMARY KEY,
      repo_id INTEGER NOT NULL REFERENCES repositories(id),
      candidate_id BIGINT NOT NULL REFERENCES work_unit_candidates(id),
      work_type VARCHAR(24) NOT NULL,
      role VARCHAR(24) NOT NULL DEFAULT 'feature',
      capability_key VARCHAR(160),
      source_commit_shas TEXT[] NOT NULL DEFAULT '{}',
      previous_unit_id BIGINT REFERENCES work_units(id),
      unit_status VARCHAR(16) NOT NULL DEFAULT 'active',
      facts JSONB NOT NULL,
      derived JSONB NOT NULL,
      derivation_ruleset_version VARCHAR(24) NOT NULL,
      extraction_confidence REAL NOT NULL DEFAULT 0,
      extraction_source VARCHAR(24) NOT NULL,
      flagged_for_review BOOLEAN NOT NULL DEFAULT false,
      shipped BOOLEAN NOT NULL DEFAULT false,
      outcome JSONB,
      outcome_updated_at TIMESTAMPTZ,
      size_metrics JSONB,
      rationale JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      shipped_at TIMESTAMPTZ,
      source_event_ids BIGINT[] NOT NULL DEFAULT '{}'
    );
  `;
  await sql`ALTER TABLE work_unit_candidates ADD COLUMN IF NOT EXISTS evidence_hash VARCHAR(64)`.catch(() => {});
  await sql`ALTER TABLE work_unit_candidates ADD COLUMN IF NOT EXISTS extraction_revision INTEGER NOT NULL DEFAULT 0`.catch(() => {});
  await sql`ALTER TABLE work_units ADD COLUMN IF NOT EXISTS role VARCHAR(24) NOT NULL DEFAULT 'feature'`.catch(() => {});
  await sql`ALTER TABLE work_units ADD COLUMN IF NOT EXISTS capability_key VARCHAR(160)`.catch(() => {});
  await sql`ALTER TABLE work_units ADD COLUMN IF NOT EXISTS source_commit_shas TEXT[] NOT NULL DEFAULT '{}'`.catch(() => {});
  await sql`ALTER TABLE work_units ADD COLUMN IF NOT EXISTS previous_unit_id BIGINT REFERENCES work_units(id)`.catch(() => {});
  await sql`ALTER TABLE work_units ADD COLUMN IF NOT EXISTS unit_status VARCHAR(16) NOT NULL DEFAULT 'active'`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS wu_repo_contrib_idx ON work_units(repo_id);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS wu_capability_idx ON work_units(candidate_id, capability_key) WHERE unit_status = 'active';`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS wu_shipped_idx ON work_units(repo_id, shipped_at) WHERE shipped = true;`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS wu_review_queue_idx ON work_units(repo_id, flagged_for_review) WHERE flagged_for_review = true;`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS wu_outcome_idx ON work_units(repo_id, shipped_at) WHERE shipped = true AND outcome IS NULL;`.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS work_unit_contributors (
      work_unit_id BIGINT NOT NULL REFERENCES work_units(id) ON DELETE CASCADE,
      contributor_id INTEGER NOT NULL REFERENCES github_contributors(id),
      attribution_weight REAL NOT NULL,
      PRIMARY KEY (work_unit_id, contributor_id)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS wuc_contrib_idx ON work_unit_contributors(contributor_id);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS wuc_unit_idx ON work_unit_contributors(work_unit_id);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS ge_repo_type_created_idx ON github_events (repo_id, event_type, created_at);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS wuc_repo_status_created_idx ON work_unit_candidates (repo_id, status, created_at);`.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS mv_contributor_leaderboard (
      repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      contributor_id INTEGER NOT NULL REFERENCES github_contributors(id) ON DELETE CASCADE,
      username VARCHAR(100) NOT NULL,
      avatar_url TEXT,
      rank INTEGER NOT NULL,
      composite REAL NOT NULL,
      impact REAL NOT NULL,
      quality REAL NOT NULL,
      collaboration REAL NOT NULL,
      consistency REAL NOT NULL,
      percentile REAL,
      decay_profile VARCHAR(24) NOT NULL,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (repo_id, contributor_id, decay_profile)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS mv_leaderboard_repo_rank_idx ON mv_contributor_leaderboard (repo_id, decay_profile, rank);`.catch(() => {});
  await sql`ALTER TABLE mv_contributor_leaderboard ADD COLUMN IF NOT EXISTS percentile REAL`.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS work_unit_overrides (
      id BIGSERIAL PRIMARY KEY,
      work_unit_id BIGINT NOT NULL REFERENCES work_units(id),
      field VARCHAR(40) NOT NULL,
      value JSONB NOT NULL,
      overridden_by INTEGER REFERENCES app_users(id),
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS wuo_unit_idx ON work_unit_overrides(work_unit_id);`.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS scoring_config (
      id BIGSERIAL PRIMARY KEY,
      version VARCHAR(24) NOT NULL,
      repo_id INTEGER REFERENCES repositories(id),
      profile VARCHAR(24) NOT NULL,
      derivation_weights JSONB NOT NULL,
      value_weights JSONB NOT NULL,
      caps JSONB NOT NULL,
      decay_half_life_days INTEGER NOT NULL DEFAULT 60,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (version, profile, repo_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS dimension_scores (
      contributor_id INTEGER NOT NULL REFERENCES github_contributors(id),
      repo_id INTEGER NOT NULL REFERENCES repositories(id),
      window_start TIMESTAMPTZ,
      window_end TIMESTAMPTZ,
      decay_profile VARCHAR(16) NOT NULL,
      impact REAL NOT NULL DEFAULT 0,
      quality REAL NOT NULL DEFAULT 0,
      collaboration REAL NOT NULL DEFAULT 0,
      consistency REAL NOT NULL DEFAULT 0,
      composite REAL NOT NULL DEFAULT 0,
      percentile REAL,
      scoring_config_version VARCHAR(24) NOT NULL,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contributor_id, repo_id, decay_profile, scoring_config_version)
    );
  `;
  await sql`ALTER TABLE dimension_scores ADD COLUMN IF NOT EXISTS percentile REAL`.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS classification_cache (
      content_hash VARCHAR(64) PRIMARY KEY,
      repo_id BIGINT NOT NULL,
      response JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`ALTER TABLE classification_cache ADD COLUMN IF NOT EXISTS repo_id BIGINT`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS classification_cache_repo_idx ON classification_cache(repo_id)`.catch(() => {});
  // Rows written before repo_id existed have NULL repo_id and are unreachable
  // (reads filter by repo_id) — drop them so they don't linger or shadow fresh writes.
  await sql`DELETE FROM classification_cache WHERE repo_id IS NULL`.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(64) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS rate_limit_bucket (
      key TEXT PRIMARY KEY,
      window_start TIMESTAMPTZ NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS job_progress (
      job_id TEXT PRIMARY KEY,
      repo_id INTEGER NOT NULL REFERENCES repositories(id),
      done INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(24) NOT NULL DEFAULT 'queued',
      error TEXT,
      result_units INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS job_progress_repo_updated_idx
      ON job_progress(repo_id, updated_at DESC);
  `.catch(() => {});

  console.log('Database schema initialized.');
}

async function swapInsightCachesConstraint() {
  const NEW_CONSTRAINT_NAME = 'insight_caches_repo_contributor_type_key';

  const tableCheck = await sql`
    SELECT 1 FROM information_schema.tables WHERE table_name = 'insight_caches'
  `;
  if (tableCheck.length === 0) return;

  // Check if the target constraint already exists by definition (not name),
  // so we're resilient to auto-generated or previously-renamed names.
  const existing = await sql`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'insight_caches'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%repo_id, contributor_id, insight_type%'
  `;
  if (existing.length > 0) {
    // Already has the correct unique constraint.
    return;
  }

  // Drop ALL existing unique constraints on insight_caches so the new one
  // can be created cleanly regardless of what the old one was named.
  const oldConstraints = await sql`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'insight_caches'::regclass AND contype = 'u'
  `;
  for (const row of oldConstraints) {
    const name = row.conname as string;
    console.log(`Dropping old unique constraint: ${name}`);
    await sql`ALTER TABLE insight_caches DROP CONSTRAINT ${sql.unsafe(name)}`.catch((err: unknown) => {
      console.error(`Failed to drop constraint ${name}:`, err instanceof Error ? err.message : err);
    });
  }

  // Dedupe rows that would collide under the new key, keeping the latest.
  await sql`
    DELETE FROM insight_caches a
    USING insight_caches b
    WHERE a.id < b.id
      AND a.repo_id IS NOT DISTINCT FROM b.repo_id
      AND a.contributor_id IS NOT DISTINCT FROM b.contributor_id
      AND a.insight_type = b.insight_type
  `.catch((err: unknown) => {
    console.error('Failed to dedupe insight_caches:', err instanceof Error ? err.message : err);
  });

  // Create the new unique constraint.
  await sql`
    ALTER TABLE insight_caches
    ADD CONSTRAINT ${sql.unsafe(NEW_CONSTRAINT_NAME)}
    UNIQUE (repo_id, contributor_id, insight_type)
  `.catch((err: unknown) => {
    console.error('Failed to create new insight_caches constraint:', err instanceof Error ? err.message : err);
  });
}

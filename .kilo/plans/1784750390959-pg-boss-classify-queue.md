# Plan: pg-boss classify-repo job queue

## Goal

Move `classifyRepo` off the Next.js request path onto a long-running Node worker backed by **pg-boss** (Postgres only, no Redis). API enqueues and returns immediately; worker processes with repo-level and candidate-level concurrency; shared Postgres rate limiter gates OpenRouter calls; `job_progress` supports polling.

## Confirmed decisions

1. **Route shape** — owner/name to match existing APIs:
   - `POST /api/repos/[owner]/[name]/classify` → enqueue, return `{ jobId }`
   - `GET /api/repos/[owner]/[name]/status` → read `job_progress` (+ optional boss state)
2. **Analyse integration** — `work_units` step in `POST .../analyse` **enqueues** + **polls** `job_progress` until terminal, streaming done/total NDJSON events; then continues scoring/insights on the request path.
3. **OpenRouter RPM** — `RATE_LIMIT_RPM` env, default **120**, shared bucket across all workers.
4. **Concurrency** — pg-boss `teamConcurrency: 2` (env `CLASSIFY_TEAM_CONCURRENCY`); within a job `p-limit(6)` candidates (env `CLASSIFY_CANDIDATE_CONCURRENCY`).
5. **Drivers** — Keep `@neondatabase/serverless` `sql` for app queries. pg-boss requires a real `pg.Pool` (TCP). Add deps: `pg-boss`, `pg`, `@types/pg`; promote `p-limit` to a direct dependency (already used transitively).
6. **Timeout / fallback** — Do **not** change OpenRouter timeout (code is `AbortSignal.timeout(45000)`, not 15s). Keep extract’s try/catch → heuristic fallback.
7. **Aggregator** — Leave batched `ANY()` / bulk insert-update in `aggregator.ts` untouched.
8. **Out of scope** — Queueing `scoreRepo` / AI narrative steps; Redis; changing `AnalyseButton` beyond existing NDJSON (progress detail already flows if analyse emits it).

## Current state

| Piece | Location |
|--------|----------|
| Inline classify | `src/lib/scoring/index.ts` → `classifyRepo` + `pLimit(6)` |
| Extract + OpenRouter | `src/lib/scoring/extract.ts` → `callStructured` (no rate limit) |
| OpenRouter fetch | `src/lib/ai/openrouter.ts` → 45s timeout, 1 retry on timeout/429/503 |
| Analyse pipeline | `src/app/api/repos/[owner]/[name]/analyse/route.ts` runs `classifyRepo` in `work_units` step |
| DB | `src/lib/db.ts` + `initSchema()`; Neon pooled `DATABASE_URL` |
| No queue / pg / pg-boss today | — |

## Architecture

```
POST .../classify  ──boss.send('classify-repo', {repoId, aiOptions}, {singletonKey})──► pgboss.*
POST .../analyse   ──same enqueue; poll job_progress; stream done/total; then scoreRepo...──►

worker.ts (Railway/Fly/PM2)
  boss.work('classify-repo', { teamConcurrency }, handler)
    → classifyRepo (aggregate + p-limit candidates)
      → extractAndPersistWorkUnits
          → acquireSlot('openrouter') before each OpenRouter call
          → job_progress upsert periodically (done/total)
```

## Schema (`initSchema()` in `src/lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS rate_limit_bucket (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_progress (
  job_id TEXT PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repositories(id),
  done INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'queued',
  -- queued | running | completed | failed
  error TEXT,
  result_units INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS job_progress_repo_updated_idx
  ON job_progress(repo_id, updated_at DESC);
```

pg-boss owns its own schema (`pgboss` by default) via `boss.start()` — do not hand-create those tables.

## New / changed files

### 1. `src/lib/queue.ts`

- Lazy-init singleton `PgBoss` with `connectionString: process.env.DATABASE_URL`.
- Options tuned for Neon/pooler:
  - `schema: 'pgboss'`
  - `newJobCheckIntervalSeconds: 2` (poll-friendly if LISTEN/NOTIFY is flaky under pooler)
  - Optional `connectionString` override via `DATABASE_URL_UNPOOLED` / `DATABASE_URL_DIRECT` when set (worker + enqueue both prefer unpooled if present).
- Export:
  - `getBoss(): Promise<PgBoss>` — start once, create queue `classify-repo` if needed
  - `enqueueClassifyRepo(repoId, aiOptions?: AiCallOptions): Promise<string>`  
    - `boss.send('classify-repo', { repoId, apiKey?, model? }, { singletonKey: \`classify-repo-${repoId}\`, retryLimit: 2, expireInHours: 6 })`  
    - On singleton hit (null/undefined id depending on pg-boss version): look up active `job_progress` for `repo_id` with `status IN ('queued','running')` and return that `job_id`; else send without singleton once or return latest job id.
  - Seed `job_progress` row: `status='queued', done=0, total=0` when a new job id is obtained.
- **Never log `apiKey`.**

### 2. `src/lib/rate-limit.ts`

- `acquireSlot(key = 'openrouter', maxRpm = Number(process.env.RATE_LIMIT_RPM) || 120): Promise<void>`
- Single-row fixed 1-minute window (called “sliding” operationally: window resets when `window_start <= NOW() - 1 min`):
  - One SQL upsert with `RETURNING count, window_start, acquired` pattern; if not acquired, `sleep` until window end (or 500–1000ms backoff) and retry.
  - Prefer atomic num slots: only increment when under max; caller blocks until success.
- Use existing neon `sql` tagged template (short request) — OK for API and worker.

### 3. `src/worker.ts` (long-running entrypoint)

- Load env (`dotenv/config` like other scripts if needed).
- `await getBoss()` then:

```ts
await boss.work(
  'classify-repo',
  { teamConcurrency: Number(process.env.CLASSIFY_TEAM_CONCURRENCY) || 2 },
  async (job) => { ... }
);
```

(Check installed `pg-boss` API: v9/v10 may pass jobs as array — handle both single job and `Job[]`.)

- Handler:
  1. Parse `{ repoId, apiKey?, model? }`.
  2. Upsert `job_progress` → `running`.
  3. Call refactored `classifyRepo(repoId, aiOptions, { onProgress, jobId })`.
  4. On success: `status=completed`, `result_units`, `done=total`.
  5. On throw: `status=failed`, `error=message`; rethrow so pg-boss can retry.
- Graceful shutdown: `SIGTERM`/`SIGINT` → `boss.stop({ graceful: true })`.
- `package.json`: `"worker": "tsx src/worker.ts"`.

### 4. Refactor `classifyRepo` (`src/lib/scoring/index.ts`)

```ts
export type ClassifyProgress = { done: number; total: number };

export async function classifyRepo(
  repoId: number,
  aiOptions?: AiCallOptions,
  opts?: {
    jobId?: string;
    candidateConcurrency?: number;
    onProgress?: (p: ClassifyProgress) => void | Promise<void>;
  }
): Promise<number>
```

- Keep `aggregateRepoCandidates` + filter pending/needs_reclassification.
- `total = pendingCandidates.length`; report progress after each candidate settles.
- `pLimit(opts?.candidateConcurrency ?? Number(process.env.CLASSIFY_CANDIDATE_CONCURRENCY) || 6)`.
- If `jobId`: every N completions (or every candidate) upsert `job_progress(done, total, updated_at)`.
- Keep `Promise.allSettled` + failedCount warning behavior.
- Scripts (`reclassify-repo.ts`) call without opts — still run inline/sync for CLI.

### 5. Rate-limit OpenRouter in extract only

In `extractAndPersistWorkUnits`, immediately before `callStructured(...)`:

```ts
await acquireSlot('openrouter');
```

Do not wrap heuristic / cache-hit paths. Do not change `callOpenRouter` globally (other analyse AI steps stay unbound by this queue-focused limiter for now).

### 6. API routes

**`src/app/api/repos/[owner]/[name]/classify/route.ts`**

- Auth + same repo ownership query as analyse.
- `getUserAiConfig(userId)`.
- `jobId = await enqueueClassifyRepo(repoId, userAiConfig)`.
- `200 { jobId, repoId }`.

**`src/app/api/repos/[owner]/[name]/status/route.ts`**

- Auth + ownership.
- Prefer `?jobId=` when provided; else latest `job_progress` for `repo_id` by `updated_at DESC`.
- Response:

```ts
{
  jobId, repoId, status, done, total,
  percent: total > 0 ? Math.round(done/total*100) : 0,
  resultUnits, error, updatedAt
}
```

- 404 if no progress row.

### 7. Analyse `work_units` step

Replace `fn: () => classifyRepo(...)` with:

1. `enqueueClassifyRepo(repoId, userAiConfig)`.
2. Emit running event with `jobId`.
3. Poll every ~1–2s (sql or internal status helper) until `completed` | `failed` (timeout e.g. 30–60 min → treat as error for step).
4. Emit intermediate events with `{ done, total }` so NDJSON clients can show progress.
5. On `failed`, throw with progress error message (step marks `error` like today).
6. On `completed`, return `{ jobId, totalUnits: result_units }`.

Do **not** run `classifyRepo` on the serverless/request path.

### 8. Env / deploy notes

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Existing Neon URL (pooler OK for app sql) |
| `DATABASE_URL_UNPOOLED` (optional) | Prefer for pg-boss Pool / worker if NOTIFY issues |
| `RATE_LIMIT_RPM` | Default 120 |
| `CLASSIFY_TEAM_CONCURRENCY` | Default 2 |
| `CLASSIFY_CANDIDATE_CONCURRENCY` | Default 6 |
| Existing `OPENROUTER_*` | Unchanged |

Worker is a **separate process** (`npm run worker`), not a Vercel/serverless function. Run via Railway/Fly/PM2 alongside the Next app.

## Implementation order

1. Add deps: `pg-boss`, `pg`, `@types/pg`, `p-limit`.
2. Schema tables in `initSchema()` (+ run `db:migrate` / init-db path used in project).
3. `src/lib/rate-limit.ts` + small Vitest for acquire logic (mock sql or pure helper extract if easier).
4. `src/lib/queue.ts` enqueue/getBoss.
5. Refactor `classifyRepo` progress hooks; wire `acquireSlot` in `extract.ts`.
6. `src/worker.ts` + `package.json` script.
7. `classify` + `status` routes.
8. Wire analyse poll loop.
9. `npm run typecheck` + `npm test` + manual: start worker, POST classify, GET status, full analyse.

## Failure modes

| Case | Behavior |
|------|----------|
| Duplicate classify clicks | `singletonKey` → one active job; API returns existing jobId |
| Worker down | Jobs stay created/active; API still returns jobId; status stays queued; analyse polls until timeout |
| OpenRouter RPM exhausted | `acquireSlot` blocks; jobs slow but don't thrash 429s |
| OpenRouter timeout/error | Existing catch → heuristic fallback per candidate |
| Partial candidate failures | `allSettled`; job still completes; failed candidates logged; may remain pending if extract never marks classified |
| Neon pooler + LISTEN | Poll interval fallback; unpooled URL override |
| Job crash mid-run | pg-boss retry; re-run pending/needs_reclassification only (classified candidates skipped unless aggregator marks needs_reclassification) |
| analyse request dies mid-poll | Worker continues; client can call GET status or re-analyse (singleton) |

## Risks

1. **pg-boss + Neon pooler** — PgBouncer can break session features. Mitigate with poll interval + optional unpooled URL for boss only.
2. **pg-boss API version** — Confirm `send`/`work`/`singletonKey` signatures against installed major; pin a current major in package.json.
3. **Long analyse HTTP** — Analyse still holds the stream open while polling (better than running AI inline, but still long-lived). Acceptable; client already uses NDJSON stream.
4. **API keys in job payload** — Stored in pgboss job data table; acceptable short-term; do not log. Optional follow-up: store only `userId` and resolve key in worker.
5. **Rate limit not transactional with fetch** — Slot acquired before request; if process dies after acquire, one slot wasted until window resets — acceptable.

## Validation

- `npm run typecheck`, `npm test`, `npm run lint`
- Unit: rate-limit acquire under/over max; optional progress callback tally
- Integration (local): `npm run worker` + POST classify → status progresses → work_units classified; second POST same repo returns same active jobId
- Analyse stream shows work_units running with increasing done/total then scoring continues
- Confirm aggregator bulk SQL paths still present (no per-candidate SELECT loop regression)

## Non-goals

- Migrating narrative AI / scoreRepo to the queue
- Frontend rewrite beyond existing analyse stream consumption
- Redis or external rate-limit service
- Changing OpenRouter 45s timeout to 15s

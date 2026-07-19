# Plan: Structured AI Architecture Rewrite

## Goal

Rewrite the AI layer of `repo-tracker` to match the AI Architecture spec: deterministic-first, structured (JSON) outputs, classification-first, cached, incremental, explainable. Replace the single free-form `generateSummary()` in `src/lib/ai.ts` with a task registry + structured-output runner, persist classifications and structured payloads, and rework the consuming UI to render structured fields (no more `dangerouslySetInnerHTML`).

## Confirmed decisions

1. **Scope** — Full rewrite of the AI layer (tasks, schemas, validation, retry, classification-first, diff facts, confidence, versioned caching) + migration of all existing summary types + per-page UI rework.
2. **Model** — Keep `tencent/hy3:free` via OpenRouter. The user states it supports structured output; the framework still sends `response_format: { type: 'json_schema', json_schema: {...} }` (with fallback to `{ type: 'json_object' }` if the model rejects `json_schema`), validates the parsed JSON with Zod, retries, and falls back deterministically. Model stays configurable via `OPENROUTER_MODEL`.
3. **Trigger** — Lazy on-demand only. Webhook handler stays insert-only. All AI work runs when a page renders or `Analyse` is clicked. `after()` / queues are out of scope.
4. **Storage** — Extend existing tables with versioned structured outputs (no new tables).
5. **Diff facts** — Derive basic facts from stored event data + fetch file-level diff facts from GitHub API on demand for PRs, cached on the event row (one fetch per event).
6. **UI** — Full per-page rework rendering structured fields; remove all `dangerouslySetInnerHTML` usage on AI output.

## Current state (reference)

- `src/lib/ai.ts` — single `generateSummary(repoId, summaryType, dateFrom, dateTo, contributorId?, generateIfMissing?)`; 4 free-form prompt branches (`weekly`, `team_insights`, `release_notes`, `areas_of_contribution`); caches text in `ai_summaries` with 1h TTL; sends raw event JSON in prompt; no validation, no retry, no confidence.
- `src/lib/scoring.ts` — deterministic `computeContributionScore()` (dimensions: featureDelivery, codeQuality, reviews, collaboration, consistency). Keep as deterministic; consume classifications as multipliers.
- `src/lib/insights.ts` — deterministic `generateRepoInsights()` health metrics; cached in `insight_caches` (UNIQUE `repo_id, insight_type`).
- `src/lib/webhook-handlers.ts` / `src/lib/github-backfill.ts` — normalized event payloads into `github_events`. Backfill has reusable installation-token + GitHub API fetch helpers.
- Pages consuming AI: `repos/[owner]/[name]/page.tsx` (weekly + team_insights + health + contributors), `[contributor]/page.tsx` (`AISummaryButton`), `releases/page.tsx` (release_notes), `compare/page.tsx` (areas_of_contribution). All render AI text via `dangerouslySetInnerHTML` with `'\n' → '<br/>'`.
- `zod` is present in `node_modules` (transitive). Add it as a direct dependency.

## Architecture overview

```
src/lib/ai/
  index.ts                 # public API: runTask(), getOrGenerate(), classifyEvents()
  runner.ts                # cache lookup -> build prompt -> call model -> validate -> retry -> fallback -> persist
  openrouter.ts            # fetch wrapper; response_format json_schema/json_object; parse
  schemas.ts               # zod schemas for every task output
  prompts.ts               # prompt builders (objective, context, schema, "no assumptions")
  context.ts               # normalize events + diff facts into prompt context (no raw payloads)
  tasks/
    work-classification.ts
    contributor-profile.ts
    repository-summary.ts
    release-notes.ts
    impact-analysis.ts
    team-insights.ts
    weekly-report.ts
    monthly-report.ts
  diff-facts.ts            # derive + fetch+cache file-level diff facts per event
  memory.ts                # fetch previous-period cached summary to feed next prompt
  fallback.ts              # deterministic keyword classification + fallback profiles
  types.ts                 # shared TS types (mirrors zod schemas)
```

Each task exports:
```ts
type AiTask<T> = {
  id: string;                    // e.g. 'repository_summary'
  schema: z.ZodSchema<T>;        // strict output schema
  promptVersion: string;         // bump to invalidate cache
  buildPrompt: (ctx: TaskContext) => { system: string; user: string };
  fallback?: (ctx: TaskContext) => T;   // deterministic fallback
  cacheTtlHours: number;
};
```

`runTask(task, ctx)` flow (the retry strategy from the spec):
1. Cache lookup by `(scope, task.id, schema_version, prompt_version, model, date range)`; return if fresh.
2. Ensure prerequisites (e.g. classification) are present for ctx events.
3. Build prompt via `context.ts` (normalized facts only — never raw payloads).
4. Call OpenRouter with `response_format: json_schema`. On HTTP/schema failure: retry once same prompt; retry once with stricter formatting system note; if still failing, call `task.fallback` (deterministic) and mark `confidence` low / `source='fallback'`.
5. Validate with `task.schema`; persist `payload` + `confidence` + `model_used` + `schema_version` + `prompt_version` + `source`.
6. Return payload.

## Schema migrations (`src/lib/db.ts` `initSchema()`)

Add via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (idempotent, matches existing migration style):

- `github_events`
  - `classification JSONB` — `{ categories, work_type, technologies, confidence, reasoning, source }`
  - `classified_at TIMESTAMP`
  - `diff_facts JSONB` — `{ files_changed, directories, languages, insertions, deletions, renamed, dependency_updates, tests_added, migrations, docs_updated, fetched_at }`
- `ai_summaries`
  - `payload JSONB` (structured output)
  - `schema_version VARCHAR(50)`
  - `prompt_version VARCHAR(50)`
  - `confidence REAL`
  - `source VARCHAR(20)` — `ai` | `fallback`
  - Keep `summary_text` (legacy). Existing rows get `schema_version='legacy'` via `UPDATE ... WHERE schema_version IS NULL`; they are ignored by structured readers and regenerated on next Analyse.
  - Cache key uniqueness: add `UNIQUE (repo_id, contributor_id, summary_type, date_from, date_to, schema_version, prompt_version)` (or index + ORDER BY generated_at DESC LIMIT 1 in queries — keep current pattern, extend WHERE with version columns).
- `insight_caches`
  - `contributor_id INTEGER REFERENCES github_contributors(id)`
  - Drop the existing `UNIQUE (repo_id, insight_type)` and recreate as `UNIQUE (repo_id, contributor_id, insight_type)` (contributor_id nullable for repo-scoped insights). Use `ALTER TABLE ... DROP CONSTRAINT` + `ADD CONSTRAINT` guarded by a check on `pg_constraint`.
  - Add `schema_version`, `prompt_version`, `confidence`, `source` to mirror `ai_summaries` (so contributor profiles / impact analyses are versioned too).
- `daily_aggregates` — already exists, unused. Use `metrics` JSONB to store lazily-cached daily fact bundles: `{ event_count, classifications: {work_type: count}, diff_totals, active_contributors }` keyed by `(repo_id, date)`. Weekly/monthly prompts read these for memory.

Add a small migration helper `src/lib/db-migrations.ts` for constraint swaps; call it from `initSchema()`.

## Task schemas (`src/lib/ai/schemas.ts`)

Define with Zod. Work-type enum (from spec): `Feature | Bug Fix | Performance | Security | Refactor | Infrastructure | Documentation | Testing | Database | API | Frontend | Backend | Other`.

- **work_classification** (batched, returns array keyed by event id):
  `{ items: [{ event_id, categories: string[], work_type, technologies: string[], confidence: number(0-1), reasoning: string }] }`
- **contributor_profile**: `{ summary, strengths: string[], focus_areas: string[], accomplishments: string[], concerns: string[], confidence }`
- **repository_summary**: `{ overview, highlights: string[], completed_features: string[], technical_changes: string[], risks: string[], next_focus: string[] }`
- **release_notes**: `{ summary, features: string[], fixes: string[], improvements: string[], breaking_changes: string[], other: string[] }`
- **impact_analysis** (per contributor; score is deterministic, AI only explains): `{ explanation, contributor_role, key_signals: string[], confidence }`
- **team_insights**: `{ review_bottlenecks: string[], single_owner_modules: string[], rising_contributors: string[], quiet_areas: string[] }`
- **weekly_report**: `{ overview, themes: string[], shipped: string[], risks: string[], next_week: string[] }`
- **monthly_report**: `{ overview, themes: string[], shipped: string[], risks: string[], next_month: string[] }`

All text fields are plain strings (no markdown); UI renders them as list items. `confidence` is `number().min(0).max(1)`.

## Classification first (`src/lib/ai/tasks/work-classification.ts`)

- `classifyEvents(repoId, eventIds | filter)` — batches unclassified events (cap per call, e.g. 25 events) into ONE AI call returning `{items:[...]}`. Persists `github_events.classification` + `classified_at` per event.
- Called lazily by the runner as a prerequisite for any summary/impact task, and by `Analyse` for the repo's recent unclassified events.
- **Fallback** (`fallback.ts`): if confidence < 0.5 or AI fails, derive `work_type` + `categories` from keyword heuristics (reuse `isFixOrRefactor` / `eventCategory` logic currently duplicated in `repos/[owner]/[name]/page.tsx` — extract into `src/lib/ai/fallback.ts` and import from both). Mark `source='fallback'`, `confidence` from a small heuristic table.
- Never classify `push` events individually when they're part of a merged PR — prefer classifying the PR event and tagging its commits. (Push events are still classified if standalone.)

## Diff facts (`src/lib/ai/diff-facts.ts`)

- `getDiffFacts(eventId)` — if `github_events.diff_facts` is null and event is `pr_merged`/`pr_opened`, fetch `/repos/{owner}/{name}/pulls/{number}/files` via installation token (reuse `getInstallationAccessToken` + `githubInstallationApi` helpers from `src/lib/github-backfill.ts` — extract shared helpers into `src/lib/github-api.ts` and import from both). Derive: `files_changed`, `directories` (unique top-2 path segments), `languages` (by extension), `renamed`, `dependency_updates` (package.json/package-lock/Cargo.toml/etc.), `tests_added` (file path matches test patterns), `migrations` (db/migrate, *.sql in migrations/), `docs_updated` (docs/, *.md). Persist to `diff_facts`. One fetch per event.
- For `push` events: derive facts from stored commit messages + commit_count only (no extra fetch).
- `context.ts` assembles a compact fact block per event for prompts; never sends raw diff or raw payload.

## Scoring integration (`src/lib/scoring.ts`)

- Keep `computeContributionScore()` deterministic and the 5 existing dimensions.
- Add optional `classifications?: Map<eventId, Classification>` param. When present, apply a predefined `WORK_TYPE_MULTIPLIER` (e.g. Security 1.3, Performance 1.2, Refactor 1.0, Bug Fix 0.9, Feature 1.0, Documentation 0.7, Testing 1.1) to base points for that event. When absent, behave exactly as today (no regression).
- AI never produces numeric scores. `impact_analysis` task receives the deterministic breakdown + classifications and writes `explanation` + `contributor_role` + `key_signals`.
- Extract the role/category heuristics currently inline in `repos/[owner]/[name]/page.tsx` (`contributorRole`, `eventCategory`, `isFix`, `buildContributionCategories`, `contributorSummary`) into `src/lib/contributor-insights.ts` so both the page and the AI fallback share them. Pages consume AI `contributor_profile` when available and `source='ai'`; otherwise fall back to these deterministic builders.

## AI memory (`src/lib/ai/memory.ts`)

- `getPreviousSummary(taskId, scope, dateTo)` — fetches the most recent cached payload for the prior period (previous week for weekly, previous weeks for monthly) and passes selected fields (overview, shipped, risks) into the next prompt as "Previous summary (do not contradict, build upon)".
- Daily fact bundles from `daily_aggregates` feed weekly prompts; weekly payloads feed monthly prompts. Computed lazily (not pre-triggered).

## API routes

- `POST /api/ai/summarize` — keep path; accept `{ repoId, task, dateFrom, dateTo, contributorId?, force? }` where `task` is a task id. Returns the structured payload (JSON), not text. Auth + repo access checks unchanged.
- `POST /api/repos/[owner]/[name]/analyse` — orchestrates: classify recent unclassified events → generate `repository_summary`, `team_insights`, `contributor_profile` (top N), `impact_analysis` (top N), refresh `health_metrics`. Returns `{ success: true }`; pages `router.refresh()`.
- `GET /api/repos/[owner]/[name]/scores` — unchanged contract but `computeContributionScore` now receives classifications; breakdown may shift slightly. Keep `contributor` + `score` shape.
- New `GET /api/repos/[owner]/[name]/events` — extend response to include `classification` and `diff_facts` per event (for any UI that wants them).
- Keep all routes guarded by `auth()` + `linked_user_id` checks as today.
- Implementer must consult `node_modules/next/dist/docs/` for Next.js 16 route-handler conventions before editing (per `AGENTS.md`).

## UI rework (per page) — remove `dangerouslySetInnerHTML` everywhere

Shared components in `src/components/ai/`:
- `<StructuredSummary payload={...} schema="repository_summary" />` — renders overview + sectioned bullet lists (highlights, completed_features, technical_changes, risks, next_focus).
- `<ContributorProfile profile={...} />` — summary + strengths/focus_areas/accomplishments/concerns chips/lists.
- `<ReleaseNotes notes={...} />` — features/fixes/improvements/breaking/other sections.
- `<TeamInsights insights={...} />` — four insight categories.
- `<ImpactExplanation analysis={...} breakdown={...} />` — replaces/augments `ExplainableScore` with AI explanation + role + key signals alongside deterministic breakdown.
- `<ConfidenceBadge value={number} source={'ai'|'fallback'} />` — shown on every AI-derived card.
- `<WeeklyReport />` / `<MonthlyReport />` renderers.

Page changes:
- `repos/[owner]/[name]/page.tsx` — AI Repository Summary → `StructuredSummary`; Team Insights → `TeamInsights`; contributor cards → `ContributorProfile` + `ImpactExplanation` (falling back to deterministic `contributorSummary`/`contributorRole` when no profile); keep Health Radar, Highlights, Spotlights, Activity Feed. Activity Feed can show classification chips per item.
- `repos/[owner]/[name]/[contributor]/page.tsx` — render `ContributorProfile` + `ImpactExplanation` server-side; replace client `AISummaryButton` with a server fetch + an `Analyse`-style re-generate button. Fill the "Recent Events" placeholder with a classified timeline.
- `repos/[owner]/[name]/releases/page.tsx` — `ReleaseNotes` component; drop `dangerouslySetInnerHTML`.
- `repos/[owner]/[name]/compare/page.tsx` — replace `areas_of_contribution` text with `ContributorProfile.focus_areas` chips; add `ImpactExplanation`.
- All text rendered as React children (auto-escaped). No `dangerouslySetInnerHTML` on AI output remains.

## Validation plan

- `npm run lint` and `npm run build` (Next.js 16 build) must pass.
- `npx tsx src/scripts/init-db.ts` must apply migrations idempotently against the existing Neon DB.
- Manual: run `Analyse` on a repo with existing events; confirm `github_events.classification` + `diff_facts` populate, `ai_summaries.payload` is valid JSON matching its Zod schema, pages render structured fields, no `dangerouslySetInnerHTML`.
- Unit-style checks (no test framework present): add `src/scripts/verify-ai.ts` (run via `tsx`) that calls `runTask` for each task with a small fixture of events and asserts Zod validation passes + fallback path returns a valid payload when `OPENROUTER_API_KEY` is unset. Document the run command in the plan handoff.

## Risks & mitigations

- **Model JSON reliability** — `tencent/hy3:free` may reject `json_schema`. Mitigation: runner falls back from `json_schema` → `json_object` → plain text parsed as JSON, then Zod, then deterministic `task.fallback`.
- **GitHub API rate limits / latency** — on-demand diff fetches add latency to first Analyse. Mitigation: one fetch per event (cached in `diff_facts`), timeout reuse from backfill, graceful skip on failure (diff facts simply absent).
- **Constraint migration on `insight_caches`** — dropping/recreating the unique constraint can fail if rows violate the new key. Mitigation: dedupe existing rows first (`DELETE` duplicates keeping latest `generated_at`) inside a guarded migration step.
- **Scoring behavior shift** — applying `WORK_TYPE_MULTIPLIER` changes contributor totals. Mitigation: multipliers default to 1.0 when classifications absent; document the change. (Acceptable per "full rewrite".)
- **Legacy cache rows** — old `ai_summaries.summary_text` rows are ignored by structured readers; pages will show "not analysed" until re-run. Acceptable.

## Out of scope

- Background/queue-based triggers (`after()`, cron, workers).
- Pre-fetching diffs at webhook time.
- Changing the deterministic health-metrics algorithm in `insights.ts` (only AI explanation of it may be added later).
- Adding `architecture` as a 6th scoring breakdown dimension (deferred; current 5 retained).
- New auth/installation flows.

## Ordered task list (for implementer)

1. Add `zod` to `package.json` dependencies; `npm install`.
2. Extend `initSchema()` with new columns + `insight_caches` constraint migration + `daily_aggregates` usage note. Run `npx tsx src/scripts/init-db.ts`.
3. Extract GitHub API helpers from `github-backfill.ts` into `src/lib/github-api.ts`; re-export from backfill.
4. Extract deterministic contributor/category heuristics from `repos/[owner]/[name]/page.tsx` into `src/lib/contributor-insights.ts`; refactor the page to import them (no behavior change yet).
5. Build `src/lib/ai/` framework: `types.ts`, `schemas.ts`, `openrouter.ts`, `runner.ts`, `context.ts`, `memory.ts`, `fallback.ts`, `index.ts`.
6. Implement `diff-facts.ts` (derive + fetch+cache).
7. Implement task modules in `src/lib/ai/tasks/` (classification, contributor_profile, repository_summary, release_notes, impact_analysis, team_insights, weekly_report, monthly_report).
8. Update `computeContributionScore` to accept optional classifications + apply `WORK_TYPE_MULTIPLIER`.
9. Rewrite API routes (`/api/ai/summarize`, `/api/repos/[owner]/[name]/analyse`, extend `/events`); keep `/scores` contract.
10. Build `src/components/ai/*` shared renderers + `ConfidenceBadge`.
11. Rework the 4 consuming pages; remove all `dangerouslySetInnerHTML` on AI output.
12. Add `src/scripts/verify-ai.ts` fixture validator; document run command.
13. Run `npm run lint`, `npm run build`, `npx tsx src/scripts/init-db.ts`, and the verify script; fix issues.

## Open questions (none blocking)

- Whether to expose weekly/monthly report pages in the navbar now or leave the tasks available but unwired. Recommendation: wire a `/repos/[owner]/[name]/reports` page rendering weekly + monthly; small addition, fits the spec.
- Whether to backfill-classify the entire event history on first Analyse (could be many calls) or only the last 30 days. Recommendation: classify last 90 days on Analyse; older events classified lazily if a summary window touches them.

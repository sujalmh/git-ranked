# GitRanked Codebase Audit — 2026-08-06

Audit performed against commit `f38fede`. Status is tracked as items are fixed.

**Build health:** `typecheck` ✅ passes · `test` ✅ 16/16 pass · `lint` ❌ 48 errors + 53 warnings

---

## 🔴 Critical — Secrets leaked in a public repo

The repo `sujalmh/git-ranked` is **PUBLIC**, and `scripts/remote-setup.sh` contained **real, valid, currently-matching production credentials** in git history:

- `DATABASE_URL` (Neon Postgres, incl. password)
- `OPENROUTER_API_KEY`

Introduced in commit `4825cb6`, present in ≥5 commits (`f38fede`, `13a5adb`, `a439a43`, `350b82b`, `bb95a9c`).

**Status:** Fixed and purged.

- [x] Remove secrets from working tree (`scripts/remote-setup.sh` now reads from env)
- [x] **Rotate both credentials** in the Neon and OpenRouter dashboards (done by owner 2026-08-07)
- [x] **Purge git history** — `git-filter-repo` rewrote all 86 commits replacing the leaked
      `npg_…` DB password and `sk-or-v1-…` OpenRouter key with `***REDACTED***`. Rewritten main
      (`ccc25b0`) + copilot branches force-pushed via `gh`. Local working repo reset to new history;
      uncommitted WIP preserved. Verify future deploys don't reintroduce secrets (grep for
      `sk-or-v1-` / `neondb_owner:`).

---

## 🔴 High — Authorization gaps in API routes

- [x] `api/repos/remove/route.ts` — deactivates any repo by `repoId` with **no ownership check**
- [x] `api/admin/scoring-profile/route.ts` — **zero auth**, anyone can rescore any repo
- [x] `api/admin/model/route.ts` — admin check hardcoded to GitHub username `'sujalmh'`
- [x] **Shared-public-repo ownership hole** — `WHERE r.installation_id IS NULL` predicates let any
      authenticated user manage public repos another user added (`classify`, `analyse`, `initialize`,
      `share`, `status`, `summarize`, dashboard, `repos` list). Fixed by scoping public repos to their
      adders via `repositories.added_by_user_id` (new column) + `src/lib/repo-access.ts` helpers.
- [x] **Private-repo analytics leak** — `/repos/{owner}/{name}` (+ `[contributor]`, `compare`) served
      full analytics for installation-tracked (potentially private) repos to any authenticated user.
      Now gated on ownership. Unauthenticated `scores`/`events`/`work-units` endpoints and the public
      `/github/{owner}/{name}` showcase page now only serve public (`installation_id IS NULL`) or
      explicitly shared (`share_enabled = true`) repos.
- [x] `api/repos/public/route.ts` — `catch (error: any)` returns `error.message` to the client
- [ ] `queue.ts` — user OpenRouter API key persisted in plaintext in the pg-boss job payload (DB at rest)

> **DB migration required:** `npm run db:migrate` adds `repositories.added_by_user_id`. Public repos
> added before this change have `added_by_user_id = NULL` and are no longer manageable/visible in the
> dashboard — owners must re-add them (the add-public-repo flow adopts existing rows on re-add).

## 🟠 High — Cost / DoS vectors on unauthenticated pages

- `getRepoAnalysisData()` generates **paid AI summaries server-side on every uncached view**
  (`github/[owner]/[name]`, `shared/[token]`, `analysis.ts:300-309`)
- `api/repos/[owner]/[name]/scores/route.ts` triggers `scoreRepo()` (full recompute) when scores are
  missing — no auth, no rate limit
- `analyse/route.ts` polls `job_progress` up to **60 min** in a streaming response — exceeds Vercel
  serverless function duration limits

## 🟠 High — Logic bugs

- [x] `insights.ts` — **inverted legacy check**: `isLegacy = prompt_version !== '2.0.0'` but the writer
      stores `'2.2.0'` → health metrics regenerated on every repo page view. Fixed with a shared
      `HEALTH_METRICS_PROMPT_VERSION` constant; legacy now means "not the current version".
- [x] `ai/index.ts` — **hardcoded AI score breakdown** (`total: 80, ...`); now reads the contributor's
      real v3 `dimension_scores` (current decay profile) so the Impact Explanation matches the page.
- [x] `ranked/Leaderboard.tsx` — wrong ranks after filter/sort (`rank={i+4}` from the filtered index);
      now uses a precomputed `rankById` map from the impact-sorted list.
- [x] `rate-limit.ts` — fixed-window race: concurrent callers could all pass the limit. Rewritten as an
      atomic `INSERT … ON CONFLICT … WHERE count < max RETURNING` gate; only a successfully claimed
      slot returns a row. Test updated.

## 🟡 Medium

- [x] 48 lint errors (`no-explicit-any`, React-compiler `setState-in-effect`, impure-function-in-render,
      `UserAiSettings.tsx` TDZ) — resolved; `eslint .` exits 0.
- [x] `contact/page.tsx` — dead form (`action="#"`, `type="button"`). Now a working `mailto:` form.
- [x] No `loading.tsx`/`error.tsx` — added root `src/app/loading.tsx` and `src/app/error.tsx`.
- [x] Dead code: `mock/page.tsx`, `mock-dashboard/page.tsx` (+ empty `mock-leaderboard/`) deleted;
      `/mock/` removed from robots.ts.
- `github/[owner]/[name]` fetches `getPublicRepository` twice (layout metadata + page)
- `instrumentation.ts` runs `initSchema()` (~60 DDL + constraint swap) on every cold start
- `pg-boss` not in `serverExternalPackages` but bundled into 2 API routes
- `mv_contributor_leaderboard` is a plain table, not a materialized view
- `auth.ts` session callback hits the DB on every request
- No installation-token caching in `github-api.ts`
- `scripts/real-run-react-live.ts` — `github_installation_id: 0` → unauthenticated backfill; global
  `DELETE FROM classification_cache`
- `test-e2e-react.ts` — no poll timeout; fake `github_id`s can clobber real users
- Accessibility: no `role="dialog"`/focus-trap/Escape on modals; hamburger lacks `aria-expanded`

## 🔵 Low / Missing features

- No leaderboard pagination beyond "show more"; no collapse
- Dashboard `getRepoInsights` per-repo N+1 (uncapped)
- `src/scripts/migrate-db.ts` is a destructive drop-tables wipe labeled a "migration"
- `.gitignore` declares `src/scripts/` ignored but files are tracked (dead rule)
- `vercel.json` project name vs `.vercel/project.json` mismatch
- `analyse/route.ts` runs `classifyEvents` **and** `enqueueClassifyRepo` in sequence (double work)

## Priority order (status)

1. ✅ Rotate leaked credentials + purge git history (CRITICAL)
2. ✅ Ownership checks on `remove`, admin auth, and the `installation_id IS NULL` hole
3. ✅ `insights.ts` inversion, hardcoded `scoreBreakdown`, Leaderboard ranks
4. ⬜ Cost/rate-limit the unauthenticated AI-generation paths (`getRepoAnalysisData` on public pages,
   `scores` route triggering `scoreRepo`, 60-min streaming wait in `analyse/route.ts`)
5. ✅ Delete `mock` pages, add `loading.tsx`/`error.tsx`, fix contact form
6. ✅ Fix lint errors
7. ⬜ Default model switched to `nvidia/nemotron-3-super-120b-a12b:free` (server key) — done 2026-08-07

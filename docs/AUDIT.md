# GitRanked Codebase Audit — 2026-08-06

Audit performed against commit `f38fede`. Status is tracked as items are fixed.

**Build health:** `typecheck` ✅ passes · `test` ✅ 16/16 pass · `lint` ❌ 48 errors + 53 warnings

---

## 🔴 Critical — Secrets leaked in a public repo

The repo `sujalmh/git-ranked` is **PUBLIC**, and `scripts/remote-setup.sh` contained **real, valid, currently-matching production credentials** in git history:

- `DATABASE_URL` (Neon Postgres, incl. password)
- `OPENROUTER_API_KEY`

Introduced in commit `4825cb6`, present in ≥5 commits (`f38fede`, `13a5adb`, `a439a43`, `350b82b`, `bb95a9c`).

**Status:** Working-tree fix committed. Rotation + history purge still required (see below).

- [x] Remove secrets from working tree (`scripts/remote-setup.sh` now reads from env)
- [ ] **Rotate both credentials** in the Neon and OpenRouter dashboards — they were exposed publicly
- [ ] **Purge git history** (BFG/filter-repo) and force-push — destructive, requires explicit consent
- [ ] Verify no other files reintroduce secrets (grep for `sk-or-v1-` / `neondb_owner:` before every commit)

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

- `insights.ts:227` — **inverted legacy check**: `isLegacy = prompt_version !== '2.0.0'` but the writer
  stores `'2.2.0'` → health metrics regenerate on every repo page view (6h cache never honored)
- `ai/index.ts:76-91` — **hardcoded AI score breakdown** (`total: 80, ...`); real computed `scoreEvents`
  is never used
- `ranked/Leaderboard.tsx:394,441` — wrong ranks after filter/sort (`rank={i+4}`)
- `rate-limit.ts` — fixed-window race: concurrent callers can all pass the limit (read old snapshot)

## 🟡 Medium

- 48 lint errors (`no-explicit-any` ×~30, React-compiler `setState-in-effect` ×5, impure-function-in-
  render ×3, `UserAiSettings.tsx:36` TDZ)
- `contact/page.tsx` — dead form (`action="#"`, `type="button"`)
- No `loading.tsx`/`error.tsx` anywhere
- `github/[owner]/[name]` fetches `getPublicRepository` twice (layout metadata + page)
- Dead code: `mock/page.tsx`, `mock-dashboard/page.tsx`
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

## Priority order

1. Rotate leaked credentials + purge git history (CRITICAL)
2. Ownership checks on `remove`, admin auth, and the `installation_id IS NULL` hole
3. `insights.ts` inversion, hardcoded `scoreBreakdown`, Leaderboard ranks
4. Cost/rate-limit the unauthenticated AI-generation paths
5. Delete `mock` pages, add `loading.tsx`/`error.tsx`, fix contact form
6. Fix 48 lint errors

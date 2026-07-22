# Plan: Priced Tiers + Razorpay Integration (refined)

## Goal

Add three pricing tiers to `repo-tracker` and enforce per-user limits on **tracked repos** and **analyses** (the `/analyse` pipeline and `/initialize` backfill), with recurring billing handled by Razorpay Subscriptions. Production-ready: a single source-of-truth `subscriptions` table, concurrency-safe quota enforcement via row locking, refundable failed analyses, one centralized capabilities service, and admin override + payment grace handling.

| Tier | Price | Mode | Repos | Analyses |
|------|-------|------|-------|----------|
| Free | ₹0 | — | 2 | 1 / rolling 30 days |
| Pro ₹399 | ₹399/mo | — | 5 | 4 / rolling 30 days |
| Pro ₹799 | ₹799/mo | **weekly** (user-chosen) | 5 | 2 / rolling 7 days |
| Pro ₹799 | ₹799/mo | **monthly** (user-chosen) | 10 | 4 / rolling 30 days |

The ₹799 tier has two **modes the user selects at subscribe time**. Repo cap and analysis window both follow the chosen mode.

## Confirmed decisions

1. **Razorpay mode** — Razorpay Subscriptions (Plans + Subscriptions + Customers). Razorpay auto-renews monthly; we activate/cancel/grace tiers via `subscription.*` webhooks.
2. **What counts as an analysis** — Each call to `POST /api/repos/[owner]/[name]/analyse` (full pipeline) **and** `POST /api/repos/[owner]/[name]/initialize` (backfill, streaming branch only — the `alreadyInitialized` early-return path does **not** consume quota) counts as one billable analysis. Reading cached insights, `/api/ai/summarize` cache hits, and page renders are free. A usage row is inserted as `pending` at the start, then flipped to `completed` or `failed`. **Failed analyses are refunded** — they do not count toward quota (see §Quota).
3. **Repo ownership** — Add `added_by_user_id` to `repositories`; set it on `/api/repos/public`. A repo counts toward a user's limit when `installation.linked_user_id = user_id OR repositories.added_by_user_id = user_id`. The dashboard's `OR r.installation_id IS NULL` clause is **replaced** with `OR r.added_by_user_id = ${session.user.id}` so public repos are owner-scoped instead of global.
4. **Reset window** — Rolling window. Quota counts usage in the trailing window; no cron, no period table.
5. **₹799 mode is user-selected** (changed from the earlier "auto-switch by repo count"): the user picks **weekly** or **monthly** at checkout. Each mode is a **distinct Razorpay Plan** (`pro799_weekly`, `pro799_monthly`) — see #16. Repo cap and analysis limits follow the chosen mode for the life of the subscription.
6. **Currency** — INR. Free / ₹399 / ₹799. UI shows ₹; copy may mention "≈ $5 / $10" but we never charge in USD.
7. **Downgrades** — When a user drops to a lower tier, existing repos/analyses are kept; we only **block** new repo additions and new analyses that would breach the new limit. No data deletion.
8. **Existing users/repos at launch** — All existing users default to `free`. Backfill `repositories.added_by_user_id` from the linked installation's `linked_user_id` where known; rows still NULL are orphaned and not counted for anyone.
9. **Idempotency** — Razorpay webhook events are deduped on `event_id` (Razorpay payload `id`) via a unique constraint on `subscription_events`. Re-deliveries are no-ops.
10. **Source of truth vs cache** — `subscriptions` is the SOT for a user's plan. `app_users.plan_tier` / `subscription_status` / `current_period_end` / `grace_until` are **denormalized cache** mirrored by the webhook and a `/billing/refresh` reconcile, used only for cheap session/nav display. Enforcement reads the SOT via the capabilities service, never the cache.
11. **Concurrency** — Quota check + insert run in one `sql.transaction` that first does `SELECT ... FOR UPDATE` on the `app_users` row, serializing per-user quota mutations. The lock is held only for the count+insert (milliseconds), never across the streaming analysis.
12. **Failed-analysis refund** — Usage rows carry `status` (`pending`|`completed`|`failed`). Quota counts `completed` rows plus in-flight `pending` rows created in the last 10 minutes; `failed` rows never count. Orphaned `pending` rows (>10 min old, from a crashed request) auto-decay out of the quota. Optional lazy cleanup of old `pending` rows is allowed but not required.
13. **Admin override** — An admin (the existing `sujalmh` gate) can grant or extend a tier (and, for ₹799, a mode) for a user via `/admin`. Override takes precedence over the subscription while `valid_until > NOW()`. Stored in `plan_overrides` (one row per user, upserted). Uses: comped accounts, trials, incident credits.
14. **Payment grace period** — On a failed renewal (`subscription.pending` / `payment.failed` for a renewal charge), set `subscriptions.status='grace'` and `grace_until = NOW() + PAYMENT_GRACE_DAYS` (default 7). The paid tier stays effective through grace. After grace, the capabilities resolver lazily downgrades to free (and flips the row to `expired`). Razorpay's own dunning runs concurrently; our grace is a safety net, not a replacement.
15. **Simple, consistent code** — No class hierarchies, no DI, no SDK. Capabilities/quota are plain async functions matching the existing `getRepoInsights` / `getRepoAnalysisData` style. Razorpay is called via `fetch` (no `razorpay` npm package). New datetime columns use `TIMESTAMPTZ`.
16. **Two Razorpay Plans for ₹799** — `pro799_weekly` and `pro799_monthly` are **separate Razorpay Plan entities**, each with its own `plan_id` (env: `RAZORPAY_PLAN_PRO799_WEEKLY` / `RAZORPAY_PLAN_PRO799_MONTHLY`). The plan_id is the **single determinant** of `(tier, planMode)`; `mapPlanId(razorpay_plan_id) → { tier, planMode } | null` resolves it from env at webhook + create time. **No dependence on Razorpay `notes`** for tier/mode — `notes` may be written for human audit only and is never read back for logic. Cleaner analytics, easier reconciliation.
17. **`pending` does NOT grant paid access** — only `active` and `grace` unlock paid features. A user who abandons checkout stays `pending` and is effectively **free** until a webhook flips the subscription to `active`. The partial unique index on `subscriptions(user_id)` therefore covers **only** `status IN ('active','grace')`; `pending` rows are not unique-constrained and are inert. `create-subscription` expires any prior `pending` rows for the user before inserting the new one, so abandoned checkouts don't accumulate.
18. **Append-only terminal history** — once a `subscriptions` row is `cancelled` or `expired`, webhook handlers **never mutate it again**. All `UPDATE` statements are guarded `WHERE razorpay_subscription_id = ? AND status IN ('pending','active','grace')`; a stray event arriving after the row is terminal affects 0 rows (logged, still 200). A new purchase always **inserts a fresh row** with a new Razorpay subscription id (never recycles a cancelled row). Resurrection of a cancelled subscription is impossible.
19. **Mid-cycle ₹799 mode switch (defensive only)** — if a plan_id is changed on an existing subscription (e.g., via the Razorpay dashboard), Razorpay emits `subscription.updated`; the webhook re-maps `razorpay_plan_id → (tier, planMode)` and updates the live row. We only *handle* this webhook; we do not build an in-app API call to trigger it this iteration. No UI button (out of scope).

## Current state (reference)

- **Auth**: `src/lib/auth.ts` — next-auth v5 (beta), GitHub provider + `github-installation` credentials. `session.user.id` = `app_users.id`.
- **User table**: `app_users` (`id`, `github_id`, `username`, `email`, `avatar_url`, `created_at`, `last_login_at`). No tier columns yet.
- **Repo table**: `repositories` — no owner column. Dashboard query: `WHERE (i.linked_user_id = ? OR r.installation_id IS NULL) AND r.is_active = true`.
- **Adding repos**: `/api/repos/public` (POST) inserts with `installation_id = NULL`, no owner.
- **Analysis endpoints**: `/api/repos/[owner]/[name]/analyse` (streaming ndjson, full pipeline) and `.../initialize` (streaming ndjson backfill). Both check `session.user.id` for repo access, not quota.
- **Admin**: `src/app/admin/page.tsx` gated to GitHub username `sujalmh`.
- **DB migrations**: single idempotent `initSchema()` in `src/lib/db.ts` using `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`; run via `src/scripts/init-db.ts` (`tsx`). No migration framework.
- **Webhook pattern**: `src/app/api/github/webhook/route.ts` reads raw `req.text()`, verifies HMAC-SHA256 with `timingSafeEqual`, then parses. Razorpay webhook mirrors this with `X-Razorpay-Signature`.
- **DB driver**: `@neondatabase/serverless` `neon()` exposes `sql` and `sql.transaction(async tx => ...)`. Not used yet in the codebase — the implementer must verify the `.transaction()` and `FOR UPDATE` behavior against the installed package in `node_modules` (see Risk #5).
- **Next.js**: Next 16.2.10 with breaking changes. `AGENTS.md` mandates reading `node_modules/next/dist/docs/` before writing route/app code. The implementer must follow this (especially route handler `params`-as-Promise, dynamic opts, `export const runtime`).
- `.env.local` holds secrets; new Razorpay keys go there. **Do not commit secrets.**

## Architecture overview

```
src/lib/
  tiers.ts              # pure config: TIERS map + resolveTierLimits + mapPlanId + planIdFor
                        #   mapPlanId(razorpay_plan_id) -> {tier, planMode} | null  (the determinant, #16)
  capabilities.ts       # getUserCapabilities(userId) -> Capabilities (single read path)
                        #   reads plan_overrides + subscriptions (active|grace only) + repoCount + usage
  quota.ts              # checkAndConsumeAnalysis(userId, repoId, kind) -> {ok, usageId, remaining}|{ok:false, reason}
                        #   sql.transaction + SELECT ... FOR UPDATE; calls resolveTierLimits (no dup)
                        # setAnalysisStatus(usageId, 'completed'|'failed')
  billing.ts            # Razorpay REST client (fetch): createCustomer, createSubscription,
                        #   fetchSubscription, cancelSubscription(cancel_at_cycle_end)
  razorpay-webhook.ts   # verify signature + dedupe on event_id + applySubscriptionEvent
                        #   (guarded UPDATE on status IN pending|active|grace only — #18; mapPlanId — #16)
  auth.ts               # session callback: attach cached planTier + status (from app_users cache, cheap)
src/app/api/
  billing/
    create-subscription/route.ts   # POST {tier, planMode} -> {subscriptionId, razorpayKeyId, ...}
    status/route.ts                # GET -> getUserCapabilities(userId) (single shape for all consumers)
    refresh/route.ts               # POST -> reconcile app_users cache from subscriptions SOT via fetchSubscription
    cancel/route.ts                # POST -> cancelSubscription(cancel_at_cycle_end: true)
  razorpay/webhook/route.ts       # POST: verify, dedupe on event_id, apply event
  admin/overrides/route.ts        # POST {userId, tier, planMode, validUntil, reason} -> upsert plan_overrides
src/app/
  pricing/page.tsx         # /pricing — tier cards, mode picker for ₹799, CTA
  billing/page.tsx         # /billing — current plan + UsageMeter + manage/cancel
  admin/page.tsx           # add override grant form + per-tier subscriber counts
  dashboard/page.tsx       # tier badge + UsageMeter; AddPublicRepo blocked state
  (landing page.tsx)       # add Pricing section + nav link
src/components/
  PricingTable.tsx         # tier cards (server component)
  UsageMeter.tsx           # repos X/limit, analyses Y/limit (window label)
  RazorpayCheckout.tsx     # 'use client' — loads checkout.js, opens modal, polls /billing/status
  UpgradePrompt.tsx        # shared 402 CTA used by AnalyseButton/InitializeButton/AddPublicRepo
```

## Data model

All via `initSchema()` (idempotent `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`). All new datetime columns are `TIMESTAMPTZ`.

### `app_users` — cached fields (NOT source of truth)
```sql
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS plan_tier VARCHAR(16) NOT NULL DEFAULT 'free';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(32);  -- 'pending'|'active'|'grace'|'halted'|'cancelled'|'expired'|NULL
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS grace_until TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
```
`plan_tier` is a cache of the **effective** tier (override-aware) mirrored by the webhook and `/billing/refresh`. Enforcement does not read it.

### `subscriptions` — source of truth
```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id),
  plan_tier VARCHAR(16) NOT NULL,             -- 'pro399' | 'pro799' (denormalized from razorpay_plan_id; never read from notes)
  plan_mode VARCHAR(8),                        -- 'weekly' | 'monthly' (denormalized from razorpay_plan_id; NULL for pro399)
  razorpay_subscription_id VARCHAR(64) UNIQUE, -- new purchase = new id = new row (see #18)
  razorpay_customer_id VARCHAR(64),
  razorpay_plan_id VARCHAR(64),                 -- determinant of (tier, planMode); see mapPlanId in tiers.ts
  status VARCHAR(32) NOT NULL DEFAULT 'pending',  -- 'pending'|'active'|'grace'|'halted'|'cancelled'|'expired'
  current_period_end TIMESTAMPTZ,
  grace_until TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes JSONB                                  -- human/audit only; never read for logic
);
-- Exactly one LIVE subscription per user. 'live' = grants paid access = active|grace.
-- pending is NOT unique-constrained (abandoned checkouts may stack; create-subscription
-- expires prior pendings first). cancelled/expired/halted rows remain frozen for history.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_live_user_unique
  ON subscriptions(user_id) WHERE status IN ('active','grace');
CREATE INDEX IF NOT EXISTS subscriptions_razorpay_sub_idx
  ON subscriptions(razorpay_subscription_id);
```
Partial-index predicate uses a literal `IN (...)` list (immutable), so it is valid in Postgres (unlike a `NOW()` predicate). The `WHERE status IN ('active','grace')` set is exactly the set that grants paid access (decision #17).

### `repositories` — owner column + index
```sql
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS added_by_user_id INTEGER REFERENCES app_users(id);
CREATE INDEX IF NOT EXISTS repositories_added_by_user_idx ON repositories(added_by_user_id);
```
One-time backfill (idempotent, safe to re-run):
```sql
UPDATE repositories r SET added_by_user_id = i.linked_user_id
FROM installations i
WHERE r.installation_id = i.id AND i.linked_user_id IS NOT NULL AND r.added_by_user_id IS NULL;
```

### `analysis_usage` — metering with status
```sql
CREATE TABLE IF NOT EXISTS analysis_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id),
  repo_id INTEGER NOT NULL REFERENCES repositories(id),
  kind VARCHAR(16) NOT NULL,                  -- 'analyse' | 'initialize' (audit only; no per-kind quota branching)
  status VARCHAR(16) NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'failed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS analysis_usage_user_created_idx ON analysis_usage(user_id, created_at);
CREATE INDEX IF NOT EXISTS analysis_usage_status_idx ON analysis_usage(user_id, status, created_at);
```

### `plan_overrides` — admin grants (one row per user)
```sql
CREATE TABLE IF NOT EXISTS plan_overrides (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id),
  tier VARCHAR(16) NOT NULL,                  -- 'free' | 'pro399' | 'pro799'
  plan_mode VARCHAR(8),                       -- 'weekly' | 'monthly' (pro799 only)
  valid_until TIMESTAMPTZ NOT NULL,
  reason TEXT,
  granted_by INTEGER REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS plan_overrides_valid_idx ON plan_overrides(valid_until);
```
PK on `user_id` enforces one row per user; admin grant upserts in place. Resolver applies it only when `valid_until > NOW()`.

### `subscription_events` — webhook audit + dedupe
```sql
CREATE TABLE IF NOT EXISTS subscription_events (
  id BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(128) UNIQUE NOT NULL,      -- razorpay payload.id
  user_id INTEGER REFERENCES app_users(id),
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Tier config (`src/lib/tiers.ts`)

Pure, no I/O. Shared by `capabilities.ts` (read) and `quota.ts` (write) — no duplicated limit math. `mapPlanId` is the **single** place that resolves a Razorpay plan_id to `(tier, planMode)`; it is the determinant (decision #16), never `notes`.

```ts
export type Tier = 'free' | 'pro399' | 'pro799';
export type PlanMode = 'weekly' | 'monthly';
export type AnalysisKind = 'analyse' | 'initialize';

export type TierLimits = {
  repoLimit: number;
  windowDays: number;
  windowLimit: number;
};

// Display/price metadata only. Plan ids live in env (see mapPlanId) — never inline.
export const TIERS = {
  free:   { label: 'Free',     priceInr: 0 },
  pro399: { label: 'Pro ₹399', priceInr: 399 },
  pro799: { label: 'Pro ₹799', priceInr: 799 },
} as const;

// Razorpay plan_id -> { tier, planMode }. Sourced entirely from env.
// Returns null for an unknown plan_id (caller fails open / logs).
export function mapPlanId(razorpayPlanId: string): { tier: Tier; planMode: PlanMode | null } | null {
  const map: Record<string, { tier: Tier; planMode: PlanMode | null }> = {
    [process.env.RAZORPAY_PLAN_PRO399!]:         { tier: 'pro399', planMode: null },
    [process.env.RAZORPAY_PLAN_PRO799_WEEKLY!]:  { tier: 'pro799', planMode: 'weekly' },
    [process.env.RAZORPAY_PLAN_PRO799_MONTHLY!]: { tier: 'pro799', planMode: 'monthly' },
  };
  const entry = map[razorpayPlanId];
  if (!entry) return null;
  // Drop env entries that are unset (undefined key collides safely).
  return razorpayPlanId ? entry : null;
}

// Reverse: which plan_id to CREATE for a given (tier, planMode) at checkout.
export function planIdFor(tier: Tier, planMode: PlanMode | null): string | null {
  if (tier === 'pro399') return process.env.RAZORPAY_PLAN_PRO399 ?? null;
  if (tier === 'pro799') return planMode === 'weekly'
    ? (process.env.RAZORPAY_PLAN_PRO799_WEEKLY ?? null)
    : (process.env.RAZORPAY_PLAN_PRO799_MONTHLY ?? null);
  return null; // free has no plan
}

export function resolveTierLimits(tier: Tier, mode: PlanMode | null): TierLimits {
  switch (tier) {
    case 'free':   return { repoLimit: 2,  windowDays: 30, windowLimit: 1 };
    case 'pro399': return { repoLimit: 5,  windowDays: 30, windowLimit: 4 };
    case 'pro799': return mode === 'weekly'
      ? { repoLimit: 5,  windowDays: 7,  windowLimit: 2 }
      : { repoLimit: 10, windowDays: 30, windowLimit: 4 };
  }
}
```
Both `analyse` and `initialize` count for every tier — `kind` is audit-only, so there is no per-kind branching to duplicate.

## Capabilities service (`src/lib/capabilities.ts`)

Single read path used by `/billing/status`, dashboard, `/analyse`, `/initialize`, `/api/repos/public`, and the session callback's richer needs. Plain async functions, no class.

```ts
export type Capabilities = {
  tier: Tier;
  planMode: PlanMode | null;
  source: 'override' | 'subscription' | 'free';
  status: string | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
  inGrace: boolean;
  repoLimit: number;
  repoCount: number;
  windowDays: number;
  windowLimit: number;
  analysisUsed: number;
  analysisRemaining: number;
  canAddRepo: boolean;
  canAnalyse: boolean;
};

export async function getUserCapabilities(userId: number): Promise<Capabilities>;
```

Resolution order inside `getUserCapabilities`:

1. `SELECT * FROM plan_overrides WHERE user_id = $userId` → if `valid_until > NOW()`, `tier = override.tier`, `planMode = override.plan_mode`, `source='override'`.
2. Else read the **live** subscription (only `active`/`grace` grant access — #17): `SELECT * FROM subscriptions WHERE user_id = $userId AND status IN ('active','grace') ORDER BY id DESC LIMIT 1`.
   - If `status='grace'` and `NOW() > grace_until` → lazily downgrade: `UPDATE subscriptions SET status='expired', updated_at=NOW() WHERE id=? AND status='grace'` (guarded; idempotent), treat as free. Best-effort one-time flip; the resolver re-reads so it's race-safe.
   - `status='active'` OR (`status='grace'` within grace) → `tier = subscription.plan_tier`, `planMode = subscription.plan_mode`, `source='subscription'`.
   - No live row (including all-`pending`) → `tier='free'`, `source='free'`. **A `pending` subscription never grants paid access.**
3. `repoCount` = count of active tracked repos (`installation.linked_user_id = userId OR added_by_user_id = userId`, excluding deleted installs).
4. `{ repoLimit, windowDays, windowLimit } = resolveTierLimits(tier, planMode)`.
5. `analysisUsed` = count in the rolling window (see §Quota query — counts `completed` + recent `pending`, excludes `failed`).
6. `analysisRemaining = max(0, windowLimit - analysisUsed)`; `canAnalyse = analysisRemaining > 0`; `canAddRepo = repoCount < repoLimit`.

The same `resolveTierLimits` and the same usage-count SQL are reused by `checkAndConsumeAnalysis` (under lock) — there is exactly one place that defines "what's the limit" and "what counts."

## Quota enforcement (`src/lib/quota.ts`)

```ts
export async function checkAndConsumeAnalysis(
  userId: number, repoId: number, kind: AnalysisKind
): Promise<{ ok: true; usageId: number; remaining: number } | { ok: false; reason: string }> {
  return await sql.transaction(async (tx) => {
    // 1. Lock the user row -> serializes per-user quota mutations.
    //    Held only for the count+insert below (milliseconds), never across the stream.
    await tx`SELECT id FROM app_users WHERE id = ${userId} FOR UPDATE`;

    // 2. Resolve effective tier+mode under the lock (same helper as capabilities).
    //    Reads plan_overrides (valid_until>now) first, else the live subscription
    //    (status IN ('active','grace') only — pending never grants access, #17).
    const { tier, planMode } = await resolveEffectiveTierLocked(tx, userId);
    const { repoLimit, windowDays, windowLimit } = resolveTierLimits(tier, planMode);

    // 3. (Optional repo-over-limit guard for installation-linked repos.)
    //    If repoCount > repoLimit -> { ok:false, reason:'tracked-repos exceed plan' }.

    // 4. Count used in the rolling window (completed + recent pending; never failed).
    const used = await tx`
      SELECT COUNT(*)::int AS c FROM analysis_usage
      WHERE user_id = ${userId}
        AND created_at >= NOW() - (${windowDays} || ' days')::INTERVAL
        AND (
          status = 'completed'
          OR (status = 'pending' AND created_at >= NOW() - INTERVAL '10 minutes')
        )
    `;
    if (used[0].c >= windowLimit) {
      return { ok: false, reason: `Analysis limit reached (${windowLimit} per ${windowDays}d). Upgrade for more.` };
    }

    // 5. Insert pending usage row; caller flips to completed/failed at stream end.
    const row = await tx`
      INSERT INTO analysis_usage (user_id, repo_id, kind, status)
      VALUES (${userId}, ${repoId}, ${kind}, 'pending') RETURNING id
    `;
    return { ok: true, usageId: row[0].id, remaining: windowLimit - used[0].c - 1 };
  });
}

export async function setAnalysisStatus(usageId: number, status: 'completed' | 'failed') {
  await sql`
    UPDATE analysis_usage SET status = ${status}, resolved_at = NOW()
    WHERE id = ${usageId} AND status = 'pending'
  `;
}
```

`resolveEffectiveTierLocked` is a private helper that mirrors steps 1–2 of `getUserCapabilities` but takes the `tx` so the reads happen under the user lock. To avoid duplicating the tier logic, `resolveTierLimits` is shared; the only difference is the SQL entry point. (Acceptable: the limit math is single-sourced; the read plumbing is necessarily different for a locked vs unlocked context.)

### Route integration

`/analyse` and `/initialize`: after the access check, call `checkAndConsumeAnalysis(userId, repoId, kind)`. On `{ok:false}` return **402** JSON `{ reason, tier }` and do **not** start the ndjson stream. On `{ok:true}` capture `usageId`, stream the pipeline, and in a `finally`-style completion on the `ReadableStream`'s `pull` (or on the final `controller.close()`) call `setAnalysisStatus(usageId, 'completed')`; on an exception path call `setAnalysisStatus(usageId, 'failed')`. For `/initialize` specifically: place `checkAndConsumeAnalysis` **after** the `alreadyInitialized` early-return so re-syncs on repos with existing events do not consume quota.

### Repo-add enforcement

`/api/repos/public` POST: call `getUserCapabilities(userId)` (or just the repoCount+repoLimit subset). If `!canAddRepo` return **402** `{ reason, tier }`. Otherwise insert with `added_by_user_id = session.user.id`.

For GitHub-App installation-linked repos (added by webhook, not user action): enforce at analysis time via the repo-over-limit guard in `checkAndConsumeAnalysis` (return 402 with an upgrade prompt). We never delete webhook-added repos.

## Razorpay integration (`src/lib/billing.ts`)

Thin `fetch` client over `https://api.razorpay.com/v1`, Basic auth `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`. Zod-validate responses before persisting.

- `createCustomer({ name, email, contact })` → `{ id }`.
- `createSubscription({ planId, customerId, totalCount: 12, notes })` → `{ id, status, short_url }`. `notes.user_id`, `notes.tier`, `notes.plan_mode` are **audit-only** — never read back for logic (#16); the `planId` argument is the determinant.
- `fetchSubscription(id)` → `{ status, current_end, plan_id, ... }`.
- `cancelSubscription(id, { cancel_at_cycle_end: true })` — let the user finish the paid period.

(No `updateSubscription` client method this iteration — a plan change is initiated via the Razorpay dashboard; we only need to *handle* the resulting `subscription.updated` webhook, not call the update API ourselves. Keeps the client surface minimal.)

### Checkout flow (with ₹799 mode picker)

1. `/pricing` shows three cards. The ₹799 card has a **mode toggle** (Weekly / Monthly) before the Subscribe button.
2. `RazorpayCheckout` (client) POSTs `/api/billing/create-subscription` `{ tier, planMode }`.
3. Server: validate `planMode` is required for `pro799` and rejected for other tiers; resolve `planId = planIdFor(tier, planMode)` (from env — #16); 404/400 if unset. **Refuse if a live subscription exists** (`SELECT 1 FROM subscriptions WHERE user_id=? AND status IN ('active','grace')`) → **409** `{ error: 'Active subscription already exists; cancel first' }`. This matches Razorpay's one-active-subscription-per-customer rule and prevents a double-`active` unique-index collision (Risk #9). Ensure a Razorpay customer exists (create if missing, persist `razorpay_customer_id`); **expire any prior `pending` rows** for the user (`UPDATE subscriptions SET status='expired', updated_at=NOW() WHERE user_id=? AND status='pending'` — #17) so abandoned checkouts don't accumulate; call `createSubscription` with `planId`; insert a **fresh** `subscriptions` row `status='pending'` with `plan_tier`/`plan_mode` (denormalized from `planId` via `mapPlanId`, never from notes), razorpay ids. Return `{ subscriptionId, razorpayKeyId, name, email, planLabel }`. **Do not** bump `app_users.plan_tier` — the user stays free until the webhook flips the row to `active` (a `pending` row never grants access, #17).
4. Client loads `https://checkout.razorpay.com/v1/checkout.js`, opens `new Razorpay({ key_id, subscription_id, name, ... }).open()`.
5. On success handler: poll `/api/billing/status` a few times (UX nicety); the webhook is the actual SOT. UI must not assume activation until the webhook (or `/billing/refresh` reconcile) has flipped the subscription to `active`.
6. Redirect to `/billing?upgraded=1`.

### Webhook (`src/app/api/razorpay/webhook/route.ts`)

Mirror the GitHub webhook verification:

- Read raw `req.text()`. `X-Razorpay-Signature` = HMAC-SHA256 of raw body with `RAZORPAY_WEBHOOK_SECRET`; `timingSafeEqual` compare.
- Parse JSON; `event_id = payload.id`. `INSERT INTO subscription_events(event_id, ...) ON CONFLICT (event_id) DO NOTHING`; if 0 rows affected, return 200 (idempotent replay).
- **Terminal-resurrection guard (#18):** every `UPDATE subscriptions ...` is guarded `WHERE razorpay_subscription_id = ? AND status IN ('pending','active','grace')`. If the row is already `cancelled`/`expired`/`halted`, the UPDATE affects 0 rows — log "ignored terminal subscription event", store the event, return 200. A cancelled subscription can never be revived by a stray webhook; a new purchase always inserts a fresh row with a new Razorpay subscription id.
- Route by `payload.event_type`:

| event | action on `subscriptions` (SOT) — guarded to `status IN ('pending','active','grace')` | mirror to `app_users` cache |
|-------|-------------------------------------------------------|----------------------------|
| `subscription.authenticated` / `subscription.activated` / `subscription.charged` (initial or renewal) | `status='active'`, `current_period_end=payload.current_end`, clear `grace_until` | `plan_tier=mapped.tier`, `subscription_status='active'`, `current_period_end`, `grace_until=NULL`, `subscription_updated_at=NOW()` |
| `subscription.updated` (Razorpay plan_id change on same sub — #19) | re-map `razorpay_plan_id=payload.plan_id`, `plan_tier=mapped.tier`, `plan_mode=mapped.planMode` (keep `status`) | mirror `plan_tier` + `plan_mode` to cache |
| `subscription.pending` / `payment.failed` (renewal) | if currently `active` → `status='grace'`, `grace_until=NOW()+PAYMENT_GRACE_DAYS`; (initial failure leaves `status='pending'` — no paid access granted, #17) | `subscription_status='grace'` + `grace_until` only when transitioning from active |
| `subscription.paused` / `subscription.halted` | `status='halted'` | `plan_tier='free'`, `subscription_status='halted'` |
| `subscription.cancelled` (immediate) / `subscription.expired` | `status='expired'` (or `'cancelled'`) | `plan_tier='free'`, `subscription_status='cancelled'`/`'expired'` |
| `subscription.cancelled` (scheduled at cycle end) | keep `status='active'` until `current_period_end`, then a later `subscription.expired` flips it | no immediate cache change |

- **`mapPlanId` resolution (#16):** `mapped = mapPlanId(payload.payload.subscription.plan_id)` (pure env lookup, no `notes`). If `mapped` is non-null, use `mapped.tier` + `mapped.planMode`. If `null` (unknown plan_id): log, store the event, **leave tier/mode unchanged** (fail-open to current tier; never silently drop a user to free, never trust `notes`). `plan_mode` is stored on the `subscriptions` row denormalized from `mapPlanId`, not read from `notes.plan_mode`.
- **`pending` never grants access (#17):** the initial-failure `subscription.pending` leaves the row `pending`; the resolver only grants on `active`/`grace`, so the user stays free. No cache `plan_tier` bump on pending.
- Always return **200** within ~5s (Razorpay retries on non-2xx). Bounded DB work; on thrown errors, log and still return 200 (dedupe protects us anyway).

### `/billing/refresh` reconcile

POST → for the current user's **live** subscription (`status IN ('active','grace')`), call `fetchSubscription(razorpay_subscription_id)` and apply the same status/tier mapping as the webhook (re-mapping `razorpay_plan_id` via `mapPlanId`, #16). Handles "webhook never arrived" cases. Triggered when the user opens `/billing` if the cache looks stale (`subscription_updated_at` older than the expected period, or a `pending` row exists for >5 min after checkout).

## Auth session enrichment (`src/lib/auth.ts`)

In the `session` callback, after loading `dbUser`, attach the **cached** fields only (cheap, no extra join):

```ts
session.user.planTier = dbUser.plan_tier;            // cache; for nav display only
session.user.subscriptionStatus = dbUser.subscription_status;
session.user.currentPeriodEnd = dbUser.current_period_end;
```
Extend `src/types/next-auth.d.ts` accordingly. **Enforcement must not use these cached fields** — it calls `getUserCapabilities` / `checkAndConsumeAnalysis`, which read the SOT.

## Admin override (`/admin` + `src/app/api/admin/overrides/route.ts`)

- `/admin/page.tsx` (already gated to `sujalmh`) gains: (a) a small form — target username, tier (`free`/`pro399`/`pro799`), mode (for pro799), `validUntil` (date), reason; (b) per-tier subscriber counts in the existing stats grid.
- `POST /api/admin/overrides`: re-verify the caller is `sujalmh`; upsert `plan_overrides` (`INSERT ... ON CONFLICT (user_id) DO UPDATE SET tier, plan_mode, valid_until, reason, granted_by, created_at`); also mirror `app_users.plan_tier` cache so nav updates immediately. Return the new capabilities.
- The capabilities resolver honors the override whenever `valid_until > NOW()`, overriding any subscription. This means an admin grant can give free users a paid tier, or extend a paid user past their grace.

## UI/UX

- **Landing (`/`)**: add a Pricing section above the footer with `PricingTable` (three cards, INR, per-tier repo/analysis limits). The ₹799 card shows the **Weekly / Monthly** mode toggle; the selected mode drives the displayed limits and the `planMode` sent to `/api/billing/create-subscription`.
- **`/pricing`**: standalone page reusing `PricingTable` + current-plan highlight (reads `getUserCapabilities`).
- **`/billing`**: server component — current plan, `subscriptionStatus`, `currentPeriodEnd`, grace banner if `inGrace`, `UsageMeter` (repos + analyses with active window label), Manage/Cancel button (calls `/api/billing/cancel`), Refresh link (calls `/billing/refresh`). Free users see upgrade CTAs.
- **Dashboard (`/dashboard`)**: compact tier badge + `UsageMeter` at top. `AddPublicRepo` disabled with `UpgradePrompt` when `!canAddRepo`.
- **AnalyseButton / InitializeButton**: on 402, show `UpgradePrompt` overlay instead of an error toast; pass `reason` + `tier`.
- **Repo page (`/repos/[owner]/[name]`)**: if `repoCount > repoLimit`, banner + disabled Analyse button.

## Backend routes — new & modified

**New**
- `src/app/api/billing/create-subscription/route.ts` — POST `{ tier, planMode }`.
- `src/app/api/billing/status/route.ts` — GET → `getUserCapabilities(userId)`.
- `src/app/api/billing/refresh/route.ts` — POST reconcile.
- `src/app/api/billing/cancel/route.ts` — POST cancel at cycle end.
- `src/app/api/razorpay/webhook/route.ts` — signature-verified, idempotent.
- `src/app/api/admin/overrides/route.ts` — POST upsert override (admin-gated).

**Modified**
- `src/app/api/repos/public/route.ts` — enforce repo limit (402); set `added_by_user_id`.
- `src/app/api/repos/[owner]/[name]/analyse/route.ts` — `checkAndConsumeAnalysis(...,'analyse')` after access check; 402 on block (no stream); `setAnalysisStatus` at stream end/error.
- `src/app/api/repos/[owner]/[name]/initialize/route.ts` — same with `kind:'initialize'`, **after** the `alreadyInitialized` early-return.
- `src/app/api/repos/route.ts` (GET) + `src/app/dashboard/page.tsx` — replace `OR r.installation_id IS NULL` with `OR r.added_by_user_id = ${session.user.id}`.
- `src/lib/auth.ts` — session callback cached tier fields.
- `src/lib/db.ts` — `initSchema()` additions (tables/columns/indexes) + idempotent backfill UPDATE.
- `src/types/next-auth.d.ts` — extend `Session.user`.
- `src/app/page.tsx` + nav — link `/pricing` and `/billing`.
- `src/app/admin/page.tsx` — override form + subscriber counts.

**No new runtime dependencies.** Razorpay via `fetch` + client `checkout.js` script. No `razorpay` npm package.

## Env vars (add to `.env.local`, never commit values)

```
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_PLAN_PRO399=
RAZORPAY_PLAN_PRO799_WEEKLY=
RAZORPAY_PLAN_PRO799_MONTHLY=
NEXT_PUBLIC_RAZORPAY_KEY_ID=          # test_/live_ key id for checkout.js
PAYMENT_GRACE_DAYS=7
ENABLE_BILLING_ENFORCEMENT=true       # flip to false to disable quota blocks without a deploy
```
A short note in `README.md` is allowed (names only, no secrets). Plan ids differ between test and live Razorpay accounts — keep per-environment.

## Migration / rollout

1. Land DB changes (idempotent `initSchema` additions) and run `npx tsx src/scripts/init-db.ts`.
2. Run the `added_by_user_id` backfill UPDATE (single statement, re-runnable).
3. Create the **three** Razorpay Plans in the dashboard (or a one-off script using `billing.ts`): ₹399/mo, ₹799/mo **weekly** (5-repo, 2/week product), ₹799/mo **monthly** (10-repo, 4/month product). All ₹799 plans share the same price; they differ only so the `plan_id` cleanly determines `(tier, planMode)` via `mapPlanId` (#16). Copy the three plan ids into env per environment.
4. Register `https://<prod>/api/razorpay/webhook` in Razorpay with the events listed in §Webhook (including `subscription.updated`); set `RAZORPAY_WEBHOOK_SECRET`.
5. `ENABLE_BILLING_ENFORCEMENT` gates quota blocks (default true in prod, false during staging smoke). UI ships unconditionally.
6. Existing users silently default to `free` via the `DEFAULT 'free'` column.

## Edge cases & failure modes

- **`pending` never grants access (#17)**: a user who abandons checkout stays `pending` → capabilities resolver returns `free`. The `/billing` page shows "Verifying your payment…" while pending; once the webhook flips to `active`, the meter updates. No paid features unlock from a `pending` row alone.
- **Resurrection guard (#18)**: a stray webhook arriving after a subscription is `cancelled`/`expired`/`halted` affects 0 rows (guarded UPDATE) and is logged; the terminal row is frozen. A new purchase inserts a fresh row with a new Razorpay subscription id — never reuses the cancelled row.
- **Stale `pending` rows**: `create-subscription` expires prior `pending` rows for the user before inserting a new one (#17). Orphaned `pending` analysis-usage rows (>10 min) auto-decay out of quota (§Quota). Optional lazy `DELETE FROM analysis_usage WHERE status='pending' AND created_at < NOW() - INTERVAL '1 day'` in `/billing/status` is allowed.
- **Webhook before checkout redirect returns**: client polls `/billing/status`; if still `pending`, show "Verifying your payment…" and retry. Webhook remains SOT.
- **Webhook never arrives**: `/billing/refresh` reconciles from `fetchSubscription`.
- **Failed analysis refunded**: `setAnalysisStatus('failed')` → row excluded from quota → slot returned to the user. Implementer must wire the `finally`/completion paths in both streaming routes.
- **Concurrent `/analyse` on same user**: serialized by `SELECT ... FOR UPDATE` on `app_users`. Two simultaneous calls cannot both pass the limit check.
- **Razorpay keys missing**: `/api/billing/*` and webhook return/log 500; enforcement still works (depends only on `subscriptions` SOT).
- **Downgrade with more repos than new limit**: repos kept; new repo adds + new analyses blocked; cached insights remain viewable.
- **`/initialize` re-sync on existing repo**: does not consume quota (early-return path).
- **Re-run `/analyse` to refresh**: consumes one analysis (intentional). UI note: "Re-analyse counts against your quota."
- **Grace expiry**: lazily downgraded in `getUserCapabilities`; the one-time `UPDATE ... status='expired' WHERE status='grace'` is best-effort and idempotent (guarded).
- **Override vs subscription precedence**: override wins while `valid_until > NOW()`; after expiry, subscription SOT resumes.
- **Mid-cycle ₹799 mode switch (#19)**: via Razorpay subscription update (plan_id change, same sub) → `subscription.updated` webhook re-maps `plan_mode`/`plan_tier` on the live row. No UI button in this iteration.
- **Upgrade while active**: `create-subscription` refuses (409) if a live subscription exists; the user must use the plan-change flow (`updateSubscription`, #19) or cancel first. This avoids two `active` rows colliding on the partial unique index.
- **Unknown `plan_id` in webhook**: `mapPlanId` returns null → event stored, tier/mode unchanged, logged. Never trust `notes`; never drop to free silently.
- **Bot/orphaned public repos** (`installation_id IS NULL AND added_by_user_id IS NULL`): not counted for anyone; admin cleanup out of scope.
- **Free user analysing an orphaned public repo**: access check rejects with 404 today (not their repo); unchanged.
- **GST/tax**: gateway-handled; out of scope.

## Validation / testing plan

No test framework in repo (`package.json` has only `lint`). The implementer should:

1. **Lint & typecheck**: `npm run lint`; `npx tsc --noEmit` (no `typecheck` script exists — run manually).
2. **Manual smoke (dev, Razorpay test mode `RAZORPAY_KEY_ID=test_...`)**:
   - Free user: `/billing` shows free + 2-repo / 1-analysis meter; 3rd public repo → 402 + upgrade; 2nd `/analyse` → 402 + upgrade.
   - **Pending never grants (#17)**: start ₹399 checkout but do **not** complete payment; verify the `subscriptions` row is `pending`, `getUserCapabilities` still returns **free** (no paid meter), and `/billing` shows "Verifying…". Then complete test payment → webhook flips `status='active'`; `/billing` meter → 5 repos / 4 analyses.
   - **Resurrection guard (#18)**: post `subscription.cancelled` → row `cancelled`. Then post a stray `subscription.charged` for the same subscription id → UPDATE affects 0 rows, row stays `cancelled`, `getUserCapabilities` returns free, event stored.
   - **Re-subscribe = fresh row (#18)**: after cancel, run `create-subscription` again → new `pending` row with a **new** `razorpay_subscription_id`; old `cancelled` row untouched. Complete → second `active` row; the partial unique `(active,grace)` allows it because the first is now terminal.
   - Simulate failed renewal: post a `subscription.pending` webhook **after** an active sub → `status='grace'`, `grace_until` set, paid tier still effective; advance clock past grace (set `grace_until=NOW()` in DB) → `getUserCapabilities` returns free; row flipped to `expired`.
   - Cancel → `cancel_at_cycle_end` keeps paid until `current_period_end`; `subscription.expired` webhook → free.
   - ₹799 **two plans (#16)**: subscribe with `planMode='weekly'` → uses `RAZORPAY_PLAN_PRO799_WEEKLY`; verify `repoLimit=5`, `windowDays=7`, `windowLimit=2`, and the `subscriptions.plan_mode='weekly'` was set via `mapPlanId` (not notes). Repeat with `planMode='monthly'` → `RAZORPAY_PLAN_PRO799_MONTHLY`; `repoLimit=10`, `windowDays=30`, `windowLimit=4`.
   - **`subscription.updated` (#19)**: simulate a Razorpay plan change (weekly→monthly on the same sub) via the dashboard or `updateSubscription`; post `subscription.updated` webhook with the monthly `plan_id` → verify `subscriptions.razorpay_plan_id` + `plan_mode` update on the **live** row, `repoLimit`/`window` follow.
   - **Upgrade guard**: with an `active` ₹399 subscription, call `create-subscription` for ₹799 → expect **409**; verify calling `updateSubscription` (plan_id change) + `subscription.updated` flips tier in place (one active row).
   - Admin override: as `sujalmh`, grant a free user `pro799` `monthly` for 7 days; verify `getUserCapabilities` returns the override tier regardless of subscription; after `valid_until`, resolver falls back to subscription/free.
   - Failed-analysis refund: trigger an `/analyse` that errors mid-stream (e.g., kill OpenRouter); verify usage row → `failed` and does **not** count toward quota; retry succeeds.
   - Concurrency: fire two `/analyse` concurrently at `windowLimit-1` used; verify exactly one gets 402 (lock serializes).
3. **Webhook idempotency**: replay same payload twice → second returns 200, `subscription_events` has 1 row, no double-mirror.
4. **Signature failure**: tamper body → 401, no DB write.
5. **Unmapped `plan_id`**: post webhook with unknown `plan_id` → `mapPlanId` returns null → event stored, tier/mode unchanged, logged; verify `notes` is ignored even if it contains a `plan_mode`.

## Risks

1. **Razorpay Subscriptions need KYC'd business entity**. If not approved, fall back to Orders (manual renewal) — flagged as a fallback, not default.
2. **Plan ids are env-coupled** (test vs prod `plan_...` differ; three plans now: ₹399, ₹799-weekly, ₹799-monthly). Never hardcode. Keep per-environment.
3. **`mapPlanId(razorpay_plan_id)`** must match when plans are recreated; an unknown id fails open (keeps current tier/mode) and logs. Since mode is derived from `plan_id` (not `notes`), recreating a plan means updating the env var — no DB backfill needed.
4. **Next 16 breaking changes** — implementer MUST read `node_modules/next/dist/docs/` per `AGENTS.md` before writing route handlers (`params` is a Promise here; heed deprecation notices).
5. **Neon `sql.transaction()` + `FOR UPDATE`** — not yet used in this repo. Implementer must verify the exact API in `@neondatabase/serverless` under `node_modules` (it exists; `sql.transaction(async tx => ...)` with `tx` as the tagged-template `sql`). If `FOR UPDATE` is unsupported in the pooled serverless driver, fall back to `SELECT ... FOR UPDATE` via `sql.unsafe` or an advisory lock (`pg_advisory_xact_lock(hashtextextended(user_id::text, ...))`) inside the same transaction — same guarantee, no schema change.
6. **Stream-after-402**: quota block must return plain JSON 402 and **never** start the ndjson stream. `AnalyseButton`/`InitializeButton` must handle 402 before reading the stream.
7. **`FOR UPDATE` briefly locks `app_users`**: held only for the count+insert (ms), not across the analysis stream. A concurrent sign-in `UPDATE app_users` may block briefly — acceptable at this scale.
8. **Cache drift**: `app_users` cache can lag the SOT if a webhook is missed; `/billing/refresh` reconciles. Enforcement is unaffected because it reads the SOT.
9. **Partial unique on `(active,grace)`**: if a webhook race ever produces two `active` rows for one user, the second `UPDATE`/`INSERT` hits the unique constraint and fails — a good safety property (forces exactly one live). The handler logs and returns 200; `/billing/refresh` reconciles to the newest. Mitigation: the guarded `UPDATE ... WHERE status IN ('pending','active','grace')` only flips the existing live row, so a second Razorpay subscription should first cancel the prior one (Razorpay enforces one active subscription per customer).

## Out of scope

- Annual plans / multi-month discounts; coupons; proration; referrals.
- Team / multi-seat billing (per-user only).
- Mid-cycle ₹799 mode-switch **UI button** (the webhook path supports it via `subscription.updated`, #19; only the in-app UI trigger is out of scope).
- Email receipts/dunning (Razorpay sends its own).
- Forcing existing users' repos under their new free-tier limit (kept; only new actions blocked).
- Migration framework (kept idempotent `initSchema` style).
- Admin subscription management beyond overrides + counts.
- Invoice download UI (link to Razorpay dashboard).
- GST/tax computation (gateway-handled).
- `typecheck` script in `package.json`.

## Open questions

None blocking. The implementer may surface two follow-ups if they arise:
- Exact INR amounts if `₹399 / ₹799` should differ.
- Whether the landing Pricing section + `/pricing` route should ship now (plan assumes now).

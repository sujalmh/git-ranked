/**
 * Repo-goal anchoring + stateful capability ledger.
 *
 * Three phases replace the old "event-independent" scoring foundation:
 *
 * 1. `repo_goal_trees` stores a deterministic GOAL TREE built from the README,
 *    repo identity, and merged PR titles. Every capability node carries a
 *    `centrality` (1–5) saying how core it is to the repo's purpose. This is a
 *    true repo-level impact scale (previously a post-hoc 0.4–1.5 multiplier
 *    with no anchor).
 *
 * 2. `capability_ledger` is the canonical node registry, UNIQUE per
 *    (repo_id, capability_key). Extraction reconciles against it with
 *    ON CONFLICT, so two events can never mint the same capability twice —
 *    cross-event awareness is enforced in the DB, not by LLM memory.
 *
 * 3. `stageWeight` / `nodeImportance` / `goalAlignmentFactor` feed the
 *    per-node saturating progress credit in scoring-engine.ts, so a unit's
 *    impact is granularity-insensitive and anchored to the repo goal.
 */

import { createHash } from 'crypto';
import { sql } from '../db';
import { callStructured, hasApiKey, type AiCallOptions } from '../ai/openrouter';
import { acquireSlot } from '../rate-limit';
import { getRepoReadme } from '../github-api';

function stripJsonFences(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  }
  return cleaned;
}

export const GOAL_TREE_VERSION = 'v1';

export interface RepoGoal {
  slug: string;
  title: string;
  description: string;
  centrality: number; // 1-5
}

export interface RepoGoalCapability {
  key: string;
  title: string;
  summary: string;
  goal: string;
  centrality: number; // 1-5
}

export interface RepoGoalTree {
  repoId: number;
  sourceHash: string;
  treeVersion: string;
  purpose: string;
  goals: RepoGoal[];
  capabilities: RepoGoalCapability[];
  /** 'ai' = built by the model; 'fallback' = deterministic fallback (retried). */
  origin: 'ai' | 'fallback';
}

export interface CapabilityLedgerRow {
  id: number;
  repo_id: number;
  capability_key: string;
  goal_slug: string;
  title: string;
  summary: string;
  centrality: number;
  status: string;
  first_shipped_at: string | null;
  last_shipped_at: string | null;
  latest_work_unit_id: number | null;
}

// ── Lifecycle stage weights / repo-goal scaling (Phase 3) ────────────────────

/** Default lifecycle stage weights: building a capability matters more than maintaining it. */
export const DEFAULT_STAGE_WEIGHTS: Record<string, number> = {
  foundation: 1,
  build: 0.9,
  feature: 0.8,
  advancement: 0.7,
  security: 0.65,
  performance: 0.6,
  refinement: 0.4,
  repair: 0.3,
  review: 0,
};

/** Tunables for the per-node saturating progress credit. */
export const DEFAULT_IMPACT_PROGRESS = {
  nodeCap: 50,
  nodeScale: 3,
  scaleFactor: 120,
  /**
   * Per-candidate (PR) saturation: a single candidate's total node credit is
   * itself saturating, so a PR the model over-splits into many nodes cannot
   * multiply its credit — while work spread across many PRs still accumulates.
   */
  candidateCap: 40,
  candidateScale: 25,
  /**
   * Shipped-code ownership blend (0-1). When git-blame ownership data exists
   * for a repo (see scripts/compute-code-ownership), impact is blended toward
   * `100 × share`: how much of the code that actually ships each contributor
   * owns. Only applied when ownership data is present, so repos without it are
   * unchanged. At 0.6, the shipped-code ownership signal dominates effort —
   * a founder who owns most of the code clearly outranks a high-volume
   * maintainer.
   */
  ownershipWeight: 0.6,
  stageWeights: DEFAULT_STAGE_WEIGHTS,
};

function clamp(lo: number, hi: number, value: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export function clampCentrality(value: number): number {
  return clamp(1, 5, Math.round(Number.isFinite(value) ? value : 3));
}

export function stageWeight(role?: string | null, weights: Record<string, number> = DEFAULT_STAGE_WEIGHTS): number {
  return weights[role ?? 'feature'] ?? 0.8;
}

/** centrality 1-5 -> 0.4 (peripheral) .. 1.0 (foundational). */
export function nodeImportance(centrality?: number): number {
  return clamp(0.4, 1, 0.4 + 0.15 * ((centrality ?? 3) - 1));
}

/** goal_alignment 1-5 -> 0.6 (tangential) .. 1.0 (directly advances the repo goal). */
export function goalAlignmentFactor(alignment?: number): number {
  return clamp(0.6, 1, 0.6 + 0.1 * ((alignment ?? 3) - 1));
}

export function normalizeSlug(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

// ── Goal tree persistence ─────────────────────────────────────────────────────

export async function loadRepoGoalTree(repoId: number): Promise<RepoGoalTree | null> {
  const rows = await sql`
    SELECT repo_id, source_hash, tree_version, purpose, data
    FROM repo_goal_trees
    WHERE repo_id = ${repoId}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0];
  const data = (row.data ?? {}) as { goals?: RepoGoal[]; capabilities?: RepoGoalCapability[]; origin?: string };
  return {
    repoId: Number(row.repo_id),
    sourceHash: String(row.source_hash ?? ''),
    treeVersion: String(row.tree_version ?? GOAL_TREE_VERSION),
    purpose: String(row.purpose ?? ''),
    goals: Array.isArray(data.goals) ? data.goals : [],
    capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
    origin: data.origin === 'ai' ? 'ai' : 'fallback',
  };
}

/** Render the goal tree as a compact prompt block. */
export function formatGoalTreeBlock(tree: RepoGoalTree): string {
  const lines: string[] = [];
  lines.push(`Repository purpose: ${tree.purpose}`);
  if (tree.goals.length > 0) {
    lines.push(`Repository goals (centrality 1-5, higher = more core to the repo's purpose):`);
    for (const g of tree.goals) {
      lines.push(`- ${g.slug} [${clampCentrality(g.centrality)}]: ${g.title}${g.description ? ` — ${g.description}` : ''}`);
    }
  }
  if (tree.capabilities.length > 0) {
    lines.push(`Existing capability nodes (reuse these exact capability_key values when a change builds, advances, refines, or repairs the same capability; assign goal_alignment 1-5):`);
    for (const c of tree.capabilities) {
      lines.push(`- ${c.key} [centrality ${clampCentrality(c.centrality)}] (${c.goal || 'general'}): ${(c.summary || c.title || '').slice(0, 140)}`);
    }
  }
  return lines.join('\n');
}

// ── Goal tree build ───────────────────────────────────────────────────────────

interface GoalTreeSource {
  purposeHint: string;
  readme: string;
  prTitles: string[];
}

async function gatherGoalTreeSource(repoId: number): Promise<GoalTreeSource> {
  const repo = await sql`SELECT owner, name FROM repositories WHERE id = ${repoId}`;
  const owner = String(repo[0]?.owner ?? '');
  const name = String(repo[0]?.name ?? '');
  const readme = (await getRepoReadme(owner, name, repoId).catch(() => null)) ?? '';
  const prRows = await sql`
    SELECT DISTINCT payload->>'title' AS title
    FROM github_events
    WHERE repo_id = ${repoId}
      AND event_type IN ('pr_merged', 'pr_opened')
      AND payload->>'title' IS NOT NULL AND payload->>'title' <> ''
    ORDER BY 1
    LIMIT 200
  `;
  const prTitles = prRows.map((r) => String(r.title ?? '').trim()).filter(Boolean);
  return { purposeHint: `${owner}/${name}`.replace(/\/$/, '') || `repo ${repoId}`, readme, prTitles };
}

function buildGoalTreeSourceHash(source: GoalTreeSource): string {
  return createHash('sha256')
    .update(`${GOAL_TREE_VERSION}\n${source.readme}\n${source.prTitles.join('\n')}`)
    .digest('hex');
}

const GOAL_TREE_SYSTEM_MESSAGE = `You are a repository-analytics planner. Given a repository's README and merged pull-request titles, build a compact GOAL TREE: the repo's primary purpose, its top goals, and the concrete capabilities the codebase is built around.

Rules:
- centrality is 1-5: 5 = foundational/core (why the repo exists), 3 = important feature, 1 = peripheral.
- capability keys are stable snake_case identifiers (e.g. video_indexing, auth_roles).
- Only list capabilities supported by the input — never invent ones.
- purpose: one crisp sentence describing what this repository does.`;

const GOAL_TREE_SCHEMA = {
  type: 'object',
  properties: {
    purpose: { type: 'string' },
    goals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          centrality: { type: 'integer', minimum: 1, maximum: 5 },
        },
        required: ['slug', 'title', 'centrality'],
      },
    },
    capabilities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          goal: { type: 'string' },
          centrality: { type: 'integer', minimum: 1, maximum: 5 },
        },
        required: ['key', 'title', 'summary', 'centrality'],
      },
    },
  },
  required: ['purpose', 'goals', 'capabilities'],
};

function parseGoalTree(raw: unknown, repoId: number, sourceHash: string): RepoGoalTree | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const purpose = String(obj.purpose ?? '').trim();
  const goals = Array.isArray(obj.goals) ? obj.goals : [];
  const capabilities = Array.isArray(obj.capabilities) ? obj.capabilities : [];
  if (goals.length === 0 && capabilities.length === 0 && !purpose) return null;

  const seenKeys = new Set<string>();
  const parsedCaps: RepoGoalCapability[] = [];
  for (const rawCap of capabilities) {
    if (!rawCap || typeof rawCap !== 'object') continue;
    const c = rawCap as Record<string, unknown>;
    const key = normalizeSlug(String(c.key ?? ''));
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    parsedCaps.push({
      key,
      title: String(c.title ?? '').slice(0, 200) || key.replace(/_/g, ' '),
      summary: String(c.summary ?? '').slice(0, 400) || String(c.title ?? '').slice(0, 400),
      goal: normalizeSlug(String(c.goal ?? 'general')) || 'general',
      centrality: clampCentrality(Number(c.centrality) || 3),
    });
  }

  const seenGoals = new Set<string>();
  const parsedGoals: RepoGoal[] = [];
  for (const rawGoal of goals) {
    if (!rawGoal || typeof rawGoal !== 'object') continue;
    const g = rawGoal as Record<string, unknown>;
    const slug = normalizeSlug(String(g.slug ?? ''));
    if (!slug || seenGoals.has(slug)) continue;
    seenGoals.add(slug);
    parsedGoals.push({
      slug,
      title: String(g.title ?? '').slice(0, 200) || slug,
      description: String(g.description ?? '').slice(0, 400),
      centrality: clampCentrality(Number(g.centrality) || 3),
    });
  }

  return {
    repoId,
    sourceHash,
    treeVersion: GOAL_TREE_VERSION,
    purpose: purpose || `repo ${repoId}`,
    goals: parsedGoals,
    capabilities: parsedCaps,
    origin: 'ai',
  };
}

async function callGoalTreeAi(
  repoId: number,
  source: GoalTreeSource,
  sourceHash: string,
  aiOptions?: AiCallOptions
): Promise<RepoGoalTree | null> {
  const readmeBlock = source.readme.trim();
  const titlesBlock = source.prTitles.length > 0 ? source.prTitles.slice(0, 200).join('\n') : '(no merged PR titles available)';
  const prompt = `Build a goal tree for this repository.

Repository: ${source.purposeHint}

README (truncated):
${readmeBlock ? readmeBlock.slice(0, 6000) : '(no README available — infer from the PR titles below)'}

Merged/opened pull request titles (up to 200):
${titlesBlock}

Return JSON: { "purpose": "<one sentence>", "goals": [{ "slug", "title", "description", "centrality" }], "capabilities": [{ "key", "title", "summary", "goal", "centrality" }] }.`;

  await acquireSlot('openrouter');
  const aiResponse = await callStructured(
    [{ role: 'system', content: GOAL_TREE_SYSTEM_MESSAGE }, { role: 'user', content: prompt }],
    GOAL_TREE_SCHEMA,
    'repo_goal_tree',
    aiOptions
  );
  if (!aiResponse) return null;
  try {
    return parseGoalTree(JSON.parse(stripJsonFences(aiResponse)), repoId, sourceHash);
  } catch {
    return null;
  }
}

/** Deterministic fallback tree when AI is unavailable: one goal, nodes from the ledger. */
async function buildFallbackGoalTree(
  repoId: number,
  source: GoalTreeSource,
  sourceHash: string
): Promise<RepoGoalTree> {
  const caps = await sql`
    SELECT capability_key, count(*)::int AS n
    FROM work_units
    WHERE repo_id = ${repoId}
      AND capability_key IS NOT NULL AND capability_key <> ''
      AND COALESCE(unit_status, 'active') = 'active'
    GROUP BY capability_key
    ORDER BY n DESC
    LIMIT 60
  `;
  const purpose = source.purposeHint.replace(/[-_]+/g, ' ');
  return {
    repoId,
    sourceHash,
    treeVersion: GOAL_TREE_VERSION,
    purpose,
    goals: [{ slug: 'core', title: 'Core capabilities', description: 'Primary capabilities shipped to production', centrality: 5 }],
    capabilities: caps.map((c) => {
      const key = String(c.capability_key);
      const label = key.replace(/_/g, ' ');
      return { key, title: label, summary: label, goal: 'core', centrality: 3 };
    }),
    origin: 'fallback',
  };
}

async function persistRepoGoalTree(tree: RepoGoalTree): Promise<void> {
  await sql`
    INSERT INTO repo_goal_trees (repo_id, source_hash, tree_version, purpose, data, updated_at)
    VALUES (
      ${tree.repoId}, ${tree.sourceHash}, ${tree.treeVersion}, ${tree.purpose},
      ${JSON.stringify({ goals: tree.goals, capabilities: tree.capabilities, origin: tree.origin })}, NOW()
    )
    ON CONFLICT (repo_id) DO UPDATE SET
      source_hash = EXCLUDED.source_hash,
      tree_version = EXCLUDED.tree_version,
      purpose = EXCLUDED.purpose,
      data = EXCLUDED.data,
      updated_at = NOW()
  `;
  await syncLedgerFromTree(tree);
}

/** Push tree centrality/goal onto existing ledger nodes so they stay deterministic. */
export async function syncLedgerFromTree(tree: RepoGoalTree): Promise<void> {
  for (const cap of tree.capabilities) {
    await sql`
      UPDATE capability_ledger
      SET centrality = ${clampCentrality(cap.centrality)},
          goal_slug = ${cap.goal || 'general'},
          updated_at = NOW()
      WHERE repo_id = ${tree.repoId} AND capability_key = ${cap.key}
    `.catch(() => {});
  }
}

/**
 * Build (or reuse) the cached goal tree for a repo. Cache is keyed on a hash of
 * the README + PR titles, so it rebuilds only when the repo's surface changes.
 * A `fallback` tree is never served as a terminal result: if AI is available it
 * is retried on every call so a transient provider failure does not lock in the
 * deterministic fallback forever. `force` skips the cache entirely.
 * Never throws: on AI failure it falls back to a deterministic ledger-derived
 * tree so extraction always has a frame of reference.
 */
export async function buildRepoGoalTree(
  repoId: number,
  aiOptions?: AiCallOptions,
  force = false
): Promise<RepoGoalTree | null> {
  const source = await gatherGoalTreeSource(repoId);
  const sourceHash = buildGoalTreeSourceHash(source);

  if (!force) {
    const existing = await loadRepoGoalTree(repoId);
    if (existing && existing.origin === 'ai' && existing.sourceHash === sourceHash && existing.treeVersion === GOAL_TREE_VERSION) {
      return existing;
    }
  }

  let tree: RepoGoalTree | null = null;
  if (hasApiKey(aiOptions)) {
    try {
      tree = await callGoalTreeAi(repoId, source, sourceHash, aiOptions);
    } catch (err) {
      console.warn('Goal tree AI build failed, using fallback tree:', err instanceof Error ? err.message : err);
    }
  }
  if (!tree) {
    tree = await buildFallbackGoalTree(repoId, source, sourceHash);
  }

  await persistRepoGoalTree(tree);
  return tree;
}

/** Build-or-load the tree, returning null only if the DB is unreachable. */
export async function ensureRepoGoalTree(
  repoId: number,
  aiOptions?: AiCallOptions
): Promise<RepoGoalTree | null> {
  const built = await buildRepoGoalTree(repoId, aiOptions).catch((err) => {
    console.warn('ensureRepoGoalTree build failed:', err instanceof Error ? err.message : err);
    return null;
  });
  return built ?? (await loadRepoGoalTree(repoId).catch(() => null));
}

/** Ready-to-embed goal tree prompt block. */
export async function buildGoalTreeBlock(repoId: number, aiOptions?: AiCallOptions): Promise<string> {
  const tree = await ensureRepoGoalTree(repoId, aiOptions);
  return tree ? formatGoalTreeBlock(tree) : '';
}

// ── Capability ledger (Phase 2) ───────────────────────────────────────────────

export async function loadCapabilityLedger(
  repoId: number,
  options?: { status?: string; limit?: number }
): Promise<CapabilityLedgerRow[]> {
  const status = options?.status ?? 'active';
  const limit = options?.limit ?? 500;
  return (await sql`
    SELECT id, repo_id, capability_key, goal_slug, title, summary, centrality, status,
           first_shipped_at, last_shipped_at, latest_work_unit_id
    FROM capability_ledger
    WHERE repo_id = ${repoId} AND status = ${status}
    ORDER BY last_shipped_at DESC NULLS LAST, id DESC
    LIMIT ${limit}
  `) as unknown as CapabilityLedgerRow[];
}

/**
 * Upsert a capability node (UNIQUE per repo+key) and return its ledger id.
 * Existing nodes keep their tree-assigned centrality; only first-write sets
 * title/summary/goal so the canonical identity stays deterministic.
 */
export async function upsertCapabilityLedgerRow(input: {
  repoId: number;
  capabilityKey: string;
  goalSlug?: string;
  title?: string;
  summary?: string;
  centrality?: number;
  shippedAt?: string | null;
  latestWorkUnitId?: number | null;
}): Promise<number> {
  const { repoId, capabilityKey, goalSlug, title, summary, centrality, shippedAt, latestWorkUnitId } = input;
  const rows = await sql`
    INSERT INTO capability_ledger (
      repo_id, capability_key, goal_slug, title, summary, centrality,
      first_shipped_at, last_shipped_at, latest_work_unit_id
    ) VALUES (
      ${repoId}, ${capabilityKey}, ${goalSlug ?? 'general'}, ${title ?? ''}, ${summary ?? ''},
      ${centrality ?? 3}, ${shippedAt ?? null}, ${shippedAt ?? null}, ${latestWorkUnitId ?? null}
    )
    ON CONFLICT (repo_id, capability_key) DO UPDATE SET
      last_shipped_at = GREATEST(capability_ledger.last_shipped_at, EXCLUDED.last_shipped_at),
      first_shipped_at = LEAST(capability_ledger.first_shipped_at, EXCLUDED.first_shipped_at),
      latest_work_unit_id = CASE
        WHEN EXCLUDED.latest_work_unit_id IS NOT NULL THEN EXCLUDED.latest_work_unit_id
        ELSE capability_ledger.latest_work_unit_id
      END,
      updated_at = NOW()
    RETURNING id
  `;
  return Number(rows[0].id);
}

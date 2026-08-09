/**
 * Repo-wide context.
 *
 * Work-unit extraction runs per candidate, so the model never sees the whole
 * repository. `buildRepoOverview` produces a compact repo-level context block
 * (purpose, contributor roster, maturity, already-shipped capabilities) that is
 * injected into extraction prompts so the model can judge each unit's place in
 * the repo — whether it is foundational, a routine feature, or a minor repair.
 *
 * Repo-goal anchoring (scoring v6) lives in `goals.ts`: the goal tree assigns
 * deterministic centrality and the capability ledger enforces cross-event
 * dedup. The old post-hoc `repo_impact` multiplier is gone.
 */

import { sql } from '../db';
import { loadRepoCapabilityRegistry } from './extract';

export interface RepoOverview {
  repoId: number;
  owner: string;
  name: string;
  label: string;
  contributors: Array<{
    username: string;
    events: number;
    shippedUnits: number;
    roles: string;
  }>;
  shippedCandidates: number;
  activeDays: number;
  spanDays: number;
  eventCount: number;
  totalUnits: number;
  capabilities: Array<{ capability_key: string; role: string; summary: string }>;
  purpose: string;
}

/**
 * Load a compact repo-level overview: identity, purpose, contributor roster,
 * maturity signals, and the most recently shipped capabilities.
 */
export async function loadRepoOverview(repoId: number): Promise<RepoOverview> {
  const repo = await sql`
    SELECT owner, name FROM repositories WHERE id = ${repoId}
  `;
  const owner = repo[0]?.owner ?? '';
  const name = repo[0]?.name ?? '';

  const stats = await sql`
    SELECT
      count(*)::int AS event_count,
      count(DISTINCT date(created_at))::int AS active_days,
      min(created_at) AS min_ts,
      max(created_at) AS max_ts
    FROM github_events
    WHERE repo_id = ${repoId}
  `;
  const eventCount = Number(stats[0]?.event_count ?? 0);
  const activeDays = Number(stats[0]?.active_days ?? 0);
  const minTs = stats[0]?.min_ts ? new Date(stats[0].min_ts as string).getTime() : null;
  const maxTs = stats[0]?.max_ts ? new Date(stats[0].max_ts as string).getTime() : null;
  const spanDays =
    minTs != null && maxTs != null ? Math.max(1, Math.round((maxTs - minTs) / 86_400_000) + 1) : 0;

  const contributorStats = await sql`
    SELECT c.username,
           count(DISTINCT e.id)::int AS events,
           count(DISTINCT wu.id)::int AS shipped_units
    FROM github_contributors c
    LEFT JOIN github_events e ON e.repo_id = ${repoId} AND e.contributor_id = c.id
    LEFT JOIN work_unit_contributors wuc ON wuc.contributor_id = c.id
    LEFT JOIN work_units wu
      ON wu.id = wuc.work_unit_id AND wu.repo_id = ${repoId}
      AND COALESCE(wu.unit_status, 'active') = 'active' AND wu.shipped = true
    WHERE EXISTS (SELECT 1 FROM github_events e2 WHERE e2.repo_id = ${repoId} AND e2.contributor_id = c.id)
    GROUP BY c.username
    ORDER BY count(DISTINCT e.id) DESC
    LIMIT 8
  `;

  const shippedCandidates = Number((await sql`
    SELECT count(DISTINCT candidate_id)::int AS n
    FROM work_units
    WHERE repo_id = ${repoId} AND COALESCE(unit_status, 'active') = 'active' AND shipped = true
  `)[0]?.n ?? 0);

  const totalUnits = Number((await sql`
    SELECT count(*)::int AS n
    FROM work_units
    WHERE repo_id = ${repoId} AND COALESCE(unit_status, 'active') = 'active'
  `)[0]?.n ?? 0);

  const roleSummary = await sql`
    SELECT c.username, wu.role, count(*)::int AS n
    FROM work_units wu
    JOIN work_unit_contributors wuc ON wuc.work_unit_id = wu.id
    JOIN github_contributors c ON c.id = wuc.contributor_id
    WHERE wu.repo_id = ${repoId} AND COALESCE(wu.unit_status, 'active') = 'active' AND wu.shipped = true
    GROUP BY c.username, wu.role
  `;
  const rolesByUser = new Map<string, string[]>();
  for (const r of roleSummary) {
    const list = rolesByUser.get(r.username as string) ?? [];
    list.push(`${r.role}×${r.n}`);
    rolesByUser.set(r.username as string, list);
  }

  const capabilities = await loadRepoCapabilityRegistry(repoId, { limit: 40 });

  const contributors = (contributorStats as Array<{
    username: string; events: number; shipped_units: number;
  }>).map((c) => ({
    username: c.username,
    events: Number(c.events ?? 0),
    shippedUnits: Number(c.shipped_units ?? 0),
    roles: (rolesByUser.get(c.username) ?? []).join(', '),
  }));

  return {
    repoId,
    owner,
    name,
    label: `${owner}/${name}`,
    contributors,
    shippedCandidates,
    activeDays,
    spanDays,
    eventCount,
    totalUnits,
    capabilities: capabilities.map((cap) => ({
      capability_key: cap.capability_key,
      role: cap.role ?? 'feature',
      summary: cap.summary ?? '',
    })),
    purpose: name.replace(/[-_]+/g, ' '),
  };
}

/** Render the overview as a compact prompt block. */
export function formatRepoOverview(overview: RepoOverview): string {
  const lines: string[] = [];
  lines.push(`Repository: ${overview.label}`);
  lines.push(`Purpose: ${overview.purpose}`);
  lines.push(`Scale: ${overview.eventCount} events, ${overview.shippedCandidates} shipped PRs/pushes, ${overview.totalUnits} active work units, ${overview.activeDays} active days over ${overview.spanDays} days`);

  if (overview.contributors.length > 0) {
    lines.push(`Contributors (events / shipped units / role mix):`);
    for (const c of overview.contributors) {
      lines.push(`  - ${c.username}: ${c.events} events, ${c.shippedUnits} units${c.roles ? ` [${c.roles}]` : ''}`);
    }
  }

  if (overview.capabilities.length > 0) {
    lines.push(`Capabilities already shipped in this repository (most recent first):`);
    for (const cap of overview.capabilities.slice(0, 25)) {
      lines.push(`  - ${cap.capability_key} [${cap.role ?? 'feature'}]: ${(cap.summary ?? '').slice(0, 100)}`);
    }
  }

  return lines.join('\n');
}

/** Full repo-overview context block ready to embed in a prompt. */
export async function buildRepoOverviewBlock(repoId: number): Promise<string> {
  const overview = await loadRepoOverview(repoId);
  return formatRepoOverview(overview);
}

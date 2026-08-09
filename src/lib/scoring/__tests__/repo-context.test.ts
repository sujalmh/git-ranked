import { describe, expect, it } from 'vitest';
import {
  formatRepoOverview,
  type RepoOverview,
} from '../repo-context';
import { roleMultiplier, scoreContributor } from '../scoring-engine';
import { PROFILE_PRESETS } from '../profiles';
import type { WorkUnit } from '../types';

const overview: RepoOverview = {
  repoId: 5,
  owner: 'sujalmh',
  name: 'AI-Powered-Surveillance-System',
  label: 'sujalmh/AI-Powered-Surveillance-System',
  contributors: [
    { username: 'sujalmh', events: 33, shippedUnits: 43, roles: 'foundation×5, advancement×16' },
    { username: 'sujnankumar', events: 107, shippedUnits: 270, roles: 'repair×60, feature×94' },
  ],
  shippedCandidates: 82,
  activeDays: 10,
  spanDays: 30,
  eventCount: 140,
  totalUnits: 362,
  capabilities: [
    { capability_key: 'chat_api_nlp_filtering', role: 'foundation', summary: 'FastAPI chat API with NLP filtering' },
    { capability_key: 'alert_streaming', role: 'feature', summary: 'Real-time SSE alert streaming' },
  ],
  purpose: 'ai powered surveillance system',
};

describe('repo overview formatter', () => {
  it('renders a compact context block with identity, scale, roster and capabilities', () => {
    const block = formatRepoOverview(overview);
    expect(block).toContain('sujalmh/AI-Powered-Surveillance-System');
    expect(block).toContain('140 events');
    expect(block).toContain('82 shipped PRs/pushes');
    expect(block).toContain('sujalmh: 33 events, 43 units');
    expect(block).toContain('foundation×5, advancement×16');
    expect(block).toContain('chat_api_nlp_filtering [foundation]');
  });

  it('handles an empty contributor roster gracefully', () => {
    const block = formatRepoOverview({ ...overview, contributors: [], capabilities: [] });
    expect(block).toContain('Repository:');
    expect(block).not.toContain('Contributors (');
    expect(block).not.toContain('Capabilities already shipped');
  });
});

describe('repo-goal centrality scaling', () => {
  it('scales impact contributions by the goal-tree centrality of the capability node', () => {
    const makeUnit = (id: number, value: number, centrality: number | undefined, goalAlignment?: number): WorkUnit => ({
      id,
      repo_id: 5,
      candidate_id: id,
      work_type: 'Feature',
      role: 'feature',
      capability_key: `cap_${id}`,
      summary: `capability ${id}`,
      facts: {
        scope: 'medium', user_visible: true, breaking_change: false, cross_cutting: false,
        testing_added: false, documentation_updated: false, new_algorithm_or_subsystem: false,
        boilerplate: false, touches_auth: false, touches_data_migration: false,
        touches_distributed_state: false, touches_architecture: false,
      },
      derived: {
        difficulty: 3, impact_base: 3, execution_quality: 3, novelty: 3, risk: 2,
        value, centrality, goal_alignment: goalAlignment,
      },
      derivation_ruleset_version: 'v6.0',
      extraction_confidence: 0.9,
      extraction_source: 'ai',
      flagged_for_review: false,
      shipped: true,
      rationale: { impact_reason: 'x', quality_reason: 'y' },
      source_event_ids: [id],
      created_at: '2026-08-01T00:00:00.000Z',
      shipped_at: '2026-08-02T00:00:00.000Z',
    });

    const events = [{ id: 1, repo_id: 5, event_type: 'push', payload: {}, created_at: '2026-08-02T00:00:00.000Z', contributor_id: 1, username: 'dev' }];

    // A foundational capability (centrality 5) must score higher than the same
    // unit at the default centrality (3), and a peripheral capability (1) lower.
    const base = scoreContributor([makeUnit(1, 0.8, undefined)], events, PROFILE_PRESETS.balanced, 'all_time');
    const foundational = scoreContributor([makeUnit(1, 0.8, 5)], events, PROFILE_PRESETS.balanced, 'all_time');
    const peripheral = scoreContributor([makeUnit(1, 0.8, 1)], events, PROFILE_PRESETS.balanced, 'all_time');

    expect(foundational.impact).toBeGreaterThan(base.impact);
    expect(peripheral.impact).toBeLessThan(base.impact);

    // goal_alignment moves impact the same direction.
    const aligned = scoreContributor([makeUnit(1, 0.8, 3, 5)], events, PROFILE_PRESETS.balanced, 'all_time');
    const tangential = scoreContributor([makeUnit(1, 0.8, 3, 1)], events, PROFILE_PRESETS.balanced, 'all_time');
    expect(aligned.impact).toBeGreaterThan(tangential.impact);

    // role multiplier still applies alongside centrality
    expect(roleMultiplier('foundation')).toBeGreaterThan(roleMultiplier('feature'));
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAGE_WEIGHTS,
  formatGoalTreeBlock,
  goalAlignmentFactor,
  normalizeSlug,
  nodeImportance,
  stageWeight,
  type RepoGoalTree,
} from '../goals';
import { computeNodeProgressImpact, scoreContributor } from '../scoring-engine';
import { PROFILE_PRESETS } from '../profiles';
import type { WorkUnit } from '../types';

const tree: RepoGoalTree = {
  repoId: 5,
  sourceHash: 'abc123',
  treeVersion: 'v1',
  origin: 'ai',
  purpose: 'AI-powered video surveillance',
  goals: [
    { slug: 'detection', title: 'Object detection', description: 'Detect objects across camera feeds', centrality: 5 },
    { slug: 'alerts', title: 'Alerting', description: 'Realtime alert streaming', centrality: 4 },
  ],
  capabilities: [
    { key: 'video_indexing', title: 'Video indexing', summary: 'Index camera footage for retrieval', goal: 'detection', centrality: 5 },
    { key: 'alert_streaming', title: 'Alert streaming', summary: 'SSE alert streaming', goal: 'alerts', centrality: 3 },
  ],
};

const baseUnit: WorkUnit = {
  id: 1,
  repo_id: 5,
  candidate_id: 1,
  work_type: 'Feature',
  role: 'feature',
  capability_key: 'video_indexing',
  summary: 'ship indexing',
  facts: {
    scope: 'medium', user_visible: false, breaking_change: false, cross_cutting: false,
    testing_added: false, documentation_updated: false, new_algorithm_or_subsystem: false,
    boilerplate: false, touches_auth: false, touches_data_migration: false,
    touches_distributed_state: false, touches_architecture: false,
  },
  derived: { difficulty: 3, impact_base: 3, execution_quality: 3, novelty: 3, risk: 2, value: 0.8, centrality: 3, goal_alignment: 3 },
  derivation_ruleset_version: 'v6.0',
  extraction_confidence: 0.9,
  extraction_source: 'ai',
  flagged_for_review: false,
  shipped: true,
  rationale: { impact_reason: 'x', quality_reason: 'y' },
  source_event_ids: [1],
  created_at: '2026-08-01T00:00:00.000Z',
  shipped_at: '2026-08-02T00:00:00.000Z',
};

describe('repo goal tree formatter', () => {
  it('renders purpose, goals, and capability nodes', () => {
    const block = formatGoalTreeBlock(tree);
    expect(block).toContain('AI-powered video surveillance');
    expect(block).toContain('detection [5]: Object detection');
    expect(block).toContain('video_indexing [centrality 5] (detection): Index camera footage');
    expect(block).toContain('alert_streaming [centrality 3] (alerts)');
  });

  it('normalizes capability slugs deterministically', () => {
    expect(normalizeSlug('  Video Indexing!! ')).toBe('video_indexing');
    expect(normalizeSlug('RBAC Roles')).toBe('rbac_roles');
  });
});

describe('lifecycle stage weights and repo-goal scaling', () => {
  it('orders stage weights: building a capability matters more than maintaining it', () => {
    expect(stageWeight('foundation', DEFAULT_STAGE_WEIGHTS)).toBeGreaterThan(stageWeight('feature', DEFAULT_STAGE_WEIGHTS));
    expect(stageWeight('feature', DEFAULT_STAGE_WEIGHTS)).toBeGreaterThan(stageWeight('refinement', DEFAULT_STAGE_WEIGHTS));
    expect(stageWeight('refinement', DEFAULT_STAGE_WEIGHTS)).toBeGreaterThan(stageWeight('repair', DEFAULT_STAGE_WEIGHTS));
    expect(stageWeight(undefined, DEFAULT_STAGE_WEIGHTS)).toBe(0.8);
  });

  it('maps centrality and goal_alignment monotonically', () => {
    expect(nodeImportance(5)).toBeGreaterThan(nodeImportance(3));
    expect(nodeImportance(3)).toBeGreaterThan(nodeImportance(1));
    expect(goalAlignmentFactor(5)).toBeGreaterThan(goalAlignmentFactor(3));
    expect(goalAlignmentFactor(3)).toBeGreaterThan(goalAlignmentFactor(1));
  });
});

describe('per-node saturating progress credit (granularity invariance)', () => {
  it('scores the same capability identically whether shipped in one unit or five', () => {
    const config = { nodeCap: 50, nodeScale: 3, candidateCap: 40, candidateScale: 25, stageWeights: DEFAULT_STAGE_WEIGHTS };
    const collapsed = [{ unit: { ...baseUnit, id: 1, derived: { ...baseUnit.derived, value: 4.5 } }, weight: 1, credit: 1 }];
    const split = Array.from({ length: 5 }, (_, index) => ({
      unit: { ...baseUnit, id: index + 10, derived: { ...baseUnit.derived, value: 0.9 } },
      weight: 1,
      credit: 1,
    }));

    expect(computeNodeProgressImpact(collapsed, config)).toBeCloseTo(computeNodeProgressImpact(split, config), 6);
  });

  it('keeps a body of work across distinct capabilities above one amazing capability', () => {
    const config = { nodeCap: 50, nodeScale: 3, candidateCap: 40, candidateScale: 25, stageWeights: DEFAULT_STAGE_WEIGHTS };
    const oneBig = [{ unit: { ...baseUnit, derived: { ...baseUnit.derived, value: 4.5 } }, weight: 1, credit: 1 }];
    const breadth = Array.from({ length: 5 }, (_, index) => ({
      unit: { ...baseUnit, id: index + 1, capability_key: `cap_${index}`, derived: { ...baseUnit.derived, value: 0.9 } },
      weight: 1,
      credit: 1,
    }));
    expect(computeNodeProgressImpact(breadth, config)).toBeGreaterThan(computeNodeProgressImpact(oneBig, config));
  });

  it('bounds a single PR over-split into many nodes (per-candidate saturation)', () => {
    const config = { nodeCap: 50, nodeScale: 3, candidateCap: 40, candidateScale: 25, stageWeights: DEFAULT_STAGE_WEIGHTS };
    // The same 12 nodes shipped either (a) all inside ONE candidate (an
    // over-split PR) or (b) across 12 separate candidates (real breadth).
    const nodeKeys = Array.from({ length: 12 }, (_, index) => `cap_${index}`);
    const sameCandidate = nodeKeys.map((key, index) => ({
      unit: { ...baseUnit, id: index + 1, candidate_id: 100, capability_key: key, derived: { ...baseUnit.derived, value: 0.7 } },
      weight: 1,
      credit: 1,
    }));
    const spreadAcrossPrs = nodeKeys.map((key, index) => ({
      unit: { ...baseUnit, id: index + 1, candidate_id: 1000 + index, capability_key: key, derived: { ...baseUnit.derived, value: 0.7 } },
      weight: 1,
      credit: 1,
    }));

    const onePr = computeNodeProgressImpact(sameCandidate, config);
    const manyPrs = computeNodeProgressImpact(spreadAcrossPrs, config);
    // The over-split PR must NOT be worth 12× a single node; spreading the same
    // work across real PRs must accumulate more.
    expect(onePr).toBeLessThan(manyPrs);
    expect(onePr).toBeLessThan(manyPrs * 0.75);
  });

  it('is granularity-invariant end-to-end through scoreContributor', () => {
    const events = [{ id: 1, repo_id: 5, event_type: 'push', payload: {}, created_at: '2026-08-02T00:00:00.000Z', contributor_id: 1, username: 'dev' }];

    const collapsed = [{ ...baseUnit, id: 1, derived: { ...baseUnit.derived, value: 4.5 } }];
    const split = Array.from({ length: 5 }, (_, index) => ({
      ...baseUnit, id: index + 10, capability_key: 'video_indexing', derived: { ...baseUnit.derived, value: 0.9 },
    }));

    const collapsedScore = scoreContributor(collapsed, events, PROFILE_PRESETS.balanced, 'all_time');
    const splitScore = scoreContributor(split, events, PROFILE_PRESETS.balanced, 'all_time');
    expect(splitScore.impact).toBeCloseTo(collapsedScore.impact, 0);
    expect(splitScore.composite).toBeCloseTo(collapsedScore.composite, 0);
  });

  it('is repo-goal aware: a foundational capability outranks a peripheral one of equal size', () => {
    const events = [{ id: 1, repo_id: 5, event_type: 'push', payload: {}, created_at: '2026-08-02T00:00:00.000Z', contributor_id: 1, username: 'dev' }];
    const foundational = scoreContributor(
      [{ ...baseUnit, derived: { ...baseUnit.derived, centrality: 5 } }],
      events, PROFILE_PRESETS.balanced, 'all_time'
    );
    const peripheral = scoreContributor(
      [{ ...baseUnit, derived: { ...baseUnit.derived, centrality: 1 } }],
      events, PROFILE_PRESETS.balanced, 'all_time'
    );
    expect(foundational.impact).toBeGreaterThan(peripheral.impact);
  });
});

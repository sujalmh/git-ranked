import { describe, expect, it } from 'vitest';
import {
  auditUnitGranularity,
  clusterChangedFiles,
  computeConservingWeights,
  MAX_REFINE_DEPTH,
  type AuditRow,
} from '../refinement';

describe('deterministic clustering', () => {
  it('groups files by directory and merges related directories to a bounded count', () => {
    const files = [
      'backend/app/routers/alerts.py',
      'backend/app/routers/chat.py',
      'backend/app/routers/cameras.py',
      'backend/app/services/alert_engine.py',
      'backend/app/services/answer_generator.py',
      'backend/app/db/mongo.py',
      'backend/app/db/seed.py',
      'frontend/app/alerts/page.tsx',
      'frontend/app/conversation/page.tsx',
      'frontend/components/chat.tsx',
    ];
    const clusters = clusterChangedFiles(files, 6);
    // Every file must appear exactly once across clusters.
    const flat = clusters.flat().sort();
    expect(flat).toEqual([...files].sort());
    expect(clusters.length).toBeLessThanOrEqual(6);
    // Routers + services share backend/app, db is its own, frontend its own.
    expect(clusters.length).toBeGreaterThanOrEqual(2);
  });

  it('returns a single cluster for a single-directory change', () => {
    const clusters = clusterChangedFiles(['a.py', 'b.py'], 6);
    expect(clusters.length).toBe(1);
    expect(clusters[0].sort()).toEqual(['a.py', 'b.py']);
  });

  it('handles empty input', () => {
    expect(clusterChangedFiles([])).toEqual([]);
  });
});

describe('precise granularity audit', () => {
  const base: AuditRow = {
    id: 1,
    candidate_id: 1,
    summary: 'Add retrieval engine',
    facts: { scope: 'medium' },
    size_metrics: { changed_files: 3 },
    extraction_source: 'ai',
    extraction_confidence: 0.9,
    refinement_depth: 0,
    audited: false,
  };

  it('flags genuine roll-up units but not specific single capabilities', () => {
    const rollUp: AuditRow = {
      ...base,
      summary: 'Add unified retrieval that combines semantic search and database queries and video indexing and alert streaming and chat APIs and camera occupancy support across the whole system',
      facts: { scope: 'system_wide' },
    };
    expect(auditUnitGranularity(rollUp)).toContain('roll_up');
    expect(auditUnitGranularity(base)).toEqual([]);
    expect(auditUnitGranularity({ ...base, summary: 'Add crowd-density alert detection with thresholds', facts: { scope: 'system_wide' } })).toEqual([]);
  });

  it('flags heuristic-source units with multi-file evidence', () => {
    expect(auditUnitGranularity({ ...base, extraction_source: 'heuristic_fallback', size_metrics: { changed_files: 8 } })).toContain('heuristic_multi_file');
    // Heuristic but few files: not flagged (noisy).
    expect(auditUnitGranularity({ ...base, extraction_source: 'heuristic_fallback', size_metrics: { changed_files: 2 } })).toEqual([]);
  });

  it('flags low-confidence units with multi-file evidence', () => {
    expect(auditUnitGranularity({ ...base, extraction_confidence: 0.3, size_metrics: { changed_files: 9 } })).toContain('low_confidence_multi_file');
    expect(auditUnitGranularity({ ...base, extraction_confidence: 0.3, size_metrics: { changed_files: 1 } })).toEqual([]);
  });

  it('never re-flags audited units or units at the depth cap', () => {
    const rollUp: AuditRow = {
      ...base,
      summary: 'Add retrieval that combines search and database and indexing and alert streaming',
      facts: { scope: 'system_wide' },
    };
    expect(auditUnitGranularity({ ...rollUp, audited: true })).toEqual([]);
    expect(auditUnitGranularity({ ...rollUp, refinement_depth: MAX_REFINE_DEPTH })).toEqual([]);
  });
});

describe('credit-conserving re-attribution', () => {
  it('even-slices the parent weight across children when there is no evidence', () => {
    const parent = new Map([[10, 1]]);
    const children = computeConservingWeights(parent, [{ evidenceContributors: [] }, { evidenceContributors: [] }]);
    expect(children[0].get(10)).toBeCloseTo(0.5);
    expect(children[1].get(10)).toBeCloseTo(0.5);
    // Total never exceeds the parent weight.
    const total = children.reduce((sum, m) => sum + (m.get(10) ?? 0), 0);
    expect(total).toBeCloseTo(1);
  });

  it('credits evidence contributors to the child they actually worked on', () => {
    const parent = new Map([[10, 1]]);
    const children = computeConservingWeights(
      parent,
      [{ evidenceContributors: [10, 10] }, { evidenceContributors: [] }]
    );
    // Child 1: evidence maps to contributor 10 (weight 1.0). Child 2: no
    // evidence -> even-sliced 0.5. Conservation cap keeps total at parent 1.0.
    const c1 = children[0].get(10) ?? 0;
    const c2 = children[1].get(10) ?? 0;
    expect(c1).toBeCloseTo(1.0);
    expect(c1 + c2).toBeLessThanOrEqual(1.0 + 1e-6);
  });

  it('scales back a contributor whose evidence lands on multiple children so total never exceeds parent weight', () => {
    const parent = new Map([[10, 0.7]]);
    const children = computeConservingWeights(
      parent,
      [{ evidenceContributors: [10, 10] }, { evidenceContributors: [10, 10] }]
    );
    const total = children.reduce((sum, m) => sum + (m.get(10) ?? 0), 0);
    expect(total).toBeCloseTo(0.7);
    // Both children get equal (0.35) because evidence is balanced.
    expect(children[0].get(10)).toBeCloseTo(0.35);
    expect(children[1].get(10)).toBeCloseTo(0.35);
  });

  it('preserves proportional multi-author weights when evidence is absent', () => {
    const parent = new Map([[10, 0.6], [11, 0.4]]);
    const children = computeConservingWeights(parent, [{ evidenceContributors: [] }, { evidenceContributors: [] }, { evidenceContributors: [] }]);
    for (const child of children) {
      expect(child.get(10)).toBeCloseTo(0.2);
      expect(child.get(11)).toBeCloseTo(0.1333, 2);
    }
  });
});

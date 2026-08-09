import { describe, expect, it } from 'vitest';
import {
  buildEvidenceHash,
  buildExtractionPrompt,
  extractChangedFilePaths,
  extractCodeEvidence,
  extractShippedAt,
  extractSourceCommitShas,
  isCandidateShipped,
  normalizeExtractionResponse,
  isMergeOnlyPush,
  shouldPreferIndividualExtraction,
} from '../extract';
import { roleMultiplier } from '../scoring-engine';
import { scoreContributor } from '../scoring-engine';
import { PROFILE_PRESETS } from '../profiles';
import type { WorkUnit } from '../types';
import type { WorkUnitCandidate } from '../aggregator';

const candidate: WorkUnitCandidate = {
  id: 7,
  repo_id: 5,
  correlation_key: 'pr:5:21',
  status: 'classified',
  source_event_ids: [11, 12],
  created_at: '2026-08-01T00:00:00.000Z',
};

describe('evidence-rich extraction and reconciliation helpers', () => {
  it('extracts file and commit evidence from a merged lifecycle', () => {
    const events = [
      {
        event_type: 'pr_opened',
        created_at: '2026-08-01T00:00:00.000Z',
        payload: { title: 'Build video indexing dashboard', body: 'Ship indexing and retrieval' },
      },
      {
        event_type: 'pr_merged',
        created_at: '2026-08-02T00:00:00.000Z',
        payload: {
          commit_shas: ['abc123'],
          files: [{ filename: 'backend/retrieval.py' }, { filename: 'frontend/dashboard.tsx' }],
          additions: 5347,
          deletions: 2472,
        },
        after_sha: 'merge999',
      },
    ];

    expect(isCandidateShipped(events)).toBe(true);
    expect(extractShippedAt(events)).toBe('2026-08-02T00:00:00.000Z');
    expect(extractSourceCommitShas(events)).toEqual(['abc123', 'merge999']);
    expect(extractChangedFilePaths(events)).toEqual(['backend/retrieval.py', 'frontend/dashboard.tsx']);
    expect(extractCodeEvidence([{ event_type: 'pr_merged', payload: { files: [{ filename: 'backend/retrieval.py', patch: '@@ -1 +1 @@\n+def retrieve()' }] } }])).toEqual([
      'backend/retrieval.py\n@@ -1 +1 @@\n+def retrieve()',
    ]);
  });

  it('normalizes OpenCode map-shaped output and assigns lifecycle roles', () => {
    const items = normalizeExtractionResponse(
      {
        retrieval: { summary: 'Extend unified retrieval with processing-step tracking', role: 'advance' },
        chat: { summary: 'Repair chat response state after retrieval updates', work_type: 'BugFix' },
      },
      'surveillance update',
      700,
      20,
      ['abc123']
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ capability_key: 'retrieval', role: 'advancement' });
    expect(items[1]).toMatchObject({ capability_key: 'chat', role: 'repair', work_type: 'BugFix' });
    expect(items[0].source_commit_shas).toEqual(['abc123']);

    const firstPass = normalizeExtractionResponse(
      { items: [{ summary: 'Introduced a coordinated retrieval layer and service', role: 'feature' }] },
      'retrieval', 1000, 20
    );
    expect(firstPass[0].role).toBe('foundation');
  });

  it('changes the cache key when code evidence or prior units change', () => {
    const events = [{ event_type: 'push', payload: { commits: [{ sha: 'a', message: 'add retrieval' }] } }];
    const first = buildEvidenceHash(candidate, events, 'v5.0', []);
    const withFileEvidence = buildEvidenceHash(
      candidate,
      [{ ...events[0], payload: { ...events[0].payload, files: [{ filename: 'retrieval.py' }] } }],
      'v5.0',
      []
    );
    const withPrevious = buildEvidenceHash(candidate, events, 'v5.0', [{ capability_key: 'retrieval', role: 'build' }]);
    expect(withFileEvidence).not.toBe(first);
    expect(withPrevious).not.toBe(first);
  });

  it('passes code evidence and the previous pass into the extraction prompt', () => {
    const prompt = buildExtractionPrompt(
      'Add retrieval dashboard', 'pr_merged', 27, 5347, 2472, 1, ['feat: add indexing'],
      'Ship dashboard', ['backend/retrieval.py', 'frontend/dashboard.tsx'],
      [{ capability_key: 'retrieval', role: 'foundation', summary: 'Build retrieval service' }], ['ff54a05']
    );
    expect(prompt).toContain('backend/retrieval.py');
    expect(prompt).toContain('retrieval');
    expect(prompt).toContain('advancement');
    expect(prompt).toContain('ff54a05');
  });

  it('keeps reliable PR size evidence authoritative and caps stats-less pushes', () => {
    const [pr] = normalizeExtractionResponse(
      { items: [{ summary: 'Ship the retrieval subsystem', facts: { scope: 'small' } }] },
      'Ship retrieval', 5347, 27, [], true
    );
    const [push] = normalizeExtractionResponse(
      { items: [{ summary: 'Large subsystem change', facts: { scope: 'system_wide' } }] },
      'Large subsystem change', 30, 0, [], false
    );
    expect(pr.facts.scope).toBe('system_wide');
    expect(push.facts.scope).toBe('medium');

    const [unverifiedPush] = normalizeExtractionResponse(
      { items: [{ summary: 'Fix timeout handling', facts: {
        scope: 'large', new_algorithm_or_subsystem: true, cross_cutting: true,
        touches_architecture: true,
      } }] },
      'Fix timeout handling', 30, 0, [], false
    );
    expect(unverifiedPush.facts.new_algorithm_or_subsystem).toBe(false);
    expect(unverifiedPush.facts.cross_cutting).toBe(false);
  });

  it('routes multi-capability PRs around the lossy batch path and drops merge-only pushes', () => {
    expect(shouldPreferIndividualExtraction({
      eventType: 'pr_opened', additions: 5347, deletions: 2472, changedFiles: 27,
      prBody: '* Feature one\n* Feature two\n* Feature three\n* Feature four',
    })).toBe(true);
    expect(isMergeOnlyPush('push', ["Merge pull request #21 from feature/main"])).toBe(true);
    expect(isMergeOnlyPush('push', ['fix: handle timeout'])).toBe(false);
  });
});

describe('role-aware score weights', () => {
  it('keeps work units primary while distinguishing lifecycle contribution', () => {
    expect(roleMultiplier('foundation')).toBeGreaterThan(roleMultiplier('build'));
    expect(roleMultiplier('build')).toBeGreaterThan(roleMultiplier('feature'));
    expect(roleMultiplier('advancement')).toBeGreaterThan(roleMultiplier('feature'));
    expect(roleMultiplier('refinement')).toBeLessThan(roleMultiplier('feature'));
    expect(roleMultiplier('repair')).toBeLessThan(roleMultiplier('feature'));
  });

  it('scores the real surveillance-repository contribution pattern in the expected order', () => {
    const makeUnit = (id: number, role: WorkUnit['role'], value: number): WorkUnit => ({
      id,
      repo_id: 5,
      candidate_id: id,
      work_type: 'Feature',
      role,
      summary: `evidence-backed capability ${id}`,
      facts: {
        scope: 'large', user_visible: true, breaking_change: false, cross_cutting: true,
        testing_added: true, documentation_updated: false, new_algorithm_or_subsystem: true,
        boilerplate: false, touches_auth: false, touches_data_migration: false,
        touches_distributed_state: true, touches_architecture: true,
      },
      derived: { difficulty: 4, impact_base: 4, execution_quality: 4, novelty: 4, risk: 2, value },
      derivation_ruleset_version: 'v5.0', extraction_confidence: 0.9,
      extraction_source: 'ai', flagged_for_review: false, shipped: true,
      rationale: { impact_reason: 'shipped capability', quality_reason: 'code evidence' },
      source_event_ids: [id], created_at: '2026-08-01T00:00:00.000Z', shipped_at: '2026-08-02T00:00:00.000Z',
    });
    const sujalmh = [
      ...Array.from({ length: 7 }, (_, index) => makeUnit(index + 1, 'foundation', 0.9)),
      ...Array.from({ length: 5 }, (_, index) => makeUnit(index + 20, 'advancement', 0.8)),
    ];
    const sujnankumar = [
      ...Array.from({ length: 5 }, (_, index) => makeUnit(index + 40, 'repair', 0.55)),
      ...Array.from({ length: 3 }, (_, index) => makeUnit(index + 50, 'advancement', 0.65)),
    ];
    const events = [{ id: 1, repo_id: 5, event_type: 'push', payload: {}, created_at: '2026-08-02T00:00:00.000Z', contributor_id: 1, username: 'dev' }];
    const sujalmhScore = scoreContributor(sujalmh, events, PROFILE_PRESETS.balanced, 'all_time');
    const sujnankumarScore = scoreContributor(sujnankumar, events, PROFILE_PRESETS.balanced, 'all_time');
    expect(sujalmhScore.impact).toBeGreaterThan(sujnankumarScore.impact);
    expect(sujalmhScore.composite).toBeGreaterThan(sujnankumarScore.composite);
  });
});

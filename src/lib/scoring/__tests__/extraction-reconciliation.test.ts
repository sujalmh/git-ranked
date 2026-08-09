import { describe, expect, it } from 'vitest';
import {
  buildEvidenceHash,
  buildExtractionPrompt,
  buildBreakdownPrompt,
  formatCapabilityRegistry,
  extractChangedFilePaths,
  extractCodeEvidence,
  extractShippedAt,
  extractSourceCommitShas,
  isCandidateShipped,
  isBroadWorkUnit,
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

  it('seeds the prompt with the repo capability registry so keys stay consistent', () => {
    const registry = [
      { capability_key: 'chat_api_nlp_filtering', role: 'foundation', summary: 'FastAPI chat API with NLP filtering' },
      { capability_key: 'alert_streaming', role: 'feature', summary: 'Real-time SSE alert streaming' },
    ];
    const prompt = buildExtractionPrompt(
      'Extend chat API filtering', 'pr_merged', 10, 500, 120, 2, ['feat: extend chat'],
      'Reuse existing chat capability', [],
      [{ capability_key: 'chat_api_nlp_filtering', role: 'foundation', summary: 'FastAPI chat API with NLP filtering' }],
      ['ff54a05'], [], registry
    );
    expect(prompt).toContain('chat_api_nlp_filtering');
    expect(prompt).toContain('alert_streaming');
    expect(prompt).toContain('Repository capabilities already shipped');
    expect(prompt).toContain('do NOT mint a new key for an existing capability');
  });

  it('formats the capability registry deterministically', () => {
    const text = formatCapabilityRegistry([
      { capability_key: 'a_cap', role: 'foundation', summary: 'Build a' },
      { capability_key: 'b_cap', role: null, summary: null },
    ]);
    expect(text).toContain('- a_cap [foundation]: Build a');
    expect(text).toContain('- b_cap [feature]: ');
    expect(formatCapabilityRegistry([])).toBe('');
  });

  it('changes the cache key when the repo capability registry changes', () => {
    const events = [{ event_type: 'pr_merged', payload: { additions: 100, changed_files: 5 } }];
    const base = buildEvidenceHash(candidate, events, 'v5.0', []);
    const withCap = buildEvidenceHash(
      candidate, events, 'v5.0', [],
      [{ capability_key: 'chat_api', role: 'foundation', summary: 'Built earlier' }]
    );
    const withAnotherCap = buildEvidenceHash(
      candidate, events, 'v5.0', [],
      [{ capability_key: 'other', role: 'feature', summary: 'Different' }]
    );
    expect(withCap).not.toBe(base);
    expect(withAnotherCap).not.toBe(withCap);
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

  it('detects broad roll-up units that need refinement into specific topics', () => {
    // A system_wide unit that clearly rolls up multiple capabilities.
    expect(isBroadWorkUnit({
      facts: { scope: 'system_wide' },
      summary: 'Add unified retrieval that combines semantic search and database queries and video indexing and alert streaming and chat APIs and camera occupancy support across the whole system',
    })).toBe(true);
    // A very long, heavily multi-topic roll-up.
    expect(isBroadWorkUnit({
      summary: 'Overhaul the backend by adding unified retrieval that combines semantic search and database queries and video indexing and alert streaming and chat APIs and camera occupancy support and per-zone tracking and loitering detection and timed-entry rules and the whole monitoring framework',
      facts: { scope: 'large' },
    })).toBe(true);
    // Specific single-capability units must not be flagged.
    expect(isBroadWorkUnit({ summary: 'Fix color mask threshold', facts: { scope: 'small' } })).toBe(false);
    expect(isBroadWorkUnit({ summary: 'Add FPS scaling logic', facts: { scope: 'medium' } })).toBe(false);
    // A system_wide scope alone (shared merged-PR stats) is not enough.
    expect(isBroadWorkUnit({ summary: 'Add crowd-density alert detection', facts: { scope: 'system_wide' } })).toBe(false);
  });

  it('builds a focused breakdown prompt that chains specifics to the broad unit', () => {
    const prompt = buildBreakdownPrompt({
      broadUnit: {
        capability_key: 'unified_retrieval_system',
        summary: 'Add unified retrieval engine combining vector search and database queries',
        role: 'advancement',
        work_type: 'Feature',
      },
      title: 'Unified retrieval',
      commitMessages: ['feat: hybrid search', 'feat: video indexing', 'fix: result merge'],
      changedFilePaths: ['backend/retrieval.py', 'backend/indexing.py'],
      codeEvidence: [],
      prBody: null,
    });
    expect(prompt).toContain('unified_retrieval_system');
    expect(prompt).toContain('Break it down');
    expect(prompt).toContain('previous_capability_key');
    expect(prompt).toContain('hybrid search');
    expect(prompt).toContain('backend/indexing.py');
  });
});

describe('broad-unit refinement and cross-candidate reconciliation', () => {
  it('only flags genuine roll-ups, not specific units or shared-PR stats', () => {
    // A comma-separated FILE list inside one fix must not count as multi-topic.
    expect(isBroadWorkUnit({
      facts: { scope: 'system_wide' },
      summary: 'Replace naive datetime.now() calls with UTC datetimes in result_merger.py, object_detection.py, and create_test_dataset.py to fix timezone handling',
    })).toBe(false);
    // system_wide scope alone (from shared merged-PR stats) is insufficient.
    expect(isBroadWorkUnit({ summary: 'Add crowd-density alert detection with thresholds', facts: { scope: 'system_wide' } })).toBe(false);
    // A medium scoped single capability is never broad.
    expect(isBroadWorkUnit({ summary: 'Add request timeouts to API calls', facts: { scope: 'medium' } })).toBe(false);
    // Empty / missing summary is never broad.
    expect(isBroadWorkUnit({ summary: '', facts: { scope: 'system_wide' } })).toBe(false);
    expect(isBroadWorkUnit({ facts: { scope: 'system_wide' } })).toBe(false);
    // Fewer than 3 topic conjunctions is not a roll-up.
    expect(isBroadWorkUnit({ summary: 'Add retrieval that combines search and ranking', facts: { scope: 'system_wide' } })).toBe(false);
  });

  it('flags long multi-topic roll-ups and large-file broad units', () => {
    expect(isBroadWorkUnit({
      summary: 'Add video indexing and alert streaming and chat APIs and camera occupancy and loitering detection and timed-entry rules and zone tracking across the entire surveillance system',
      facts: { scope: 'system_wide' },
    })).toBe(true);
    // 20+ files with a 220+ char multi-topic summary.
    expect(isBroadWorkUnit({
      summary: 'Add retrieval that combines semantic search and database queries and video indexing and alert streaming and chat APIs and camera occupancy and per-zone tracking and loitering detection and timed-entry rules and the monitoring framework',
      facts: { scope: 'large' },
      size_metrics: { changed_files: 24 },
    })).toBe(true);
  });

  it('normalizes previous_capability_key from model responses', () => {
    const [item] = normalizeExtractionResponse(
      { items: [{ summary: 'Extend chat API', previous_capability_key: 'chat_api_nlp_filtering' }] },
      'chat', 100, 5
    );
    expect(item.previous_capability_key).toBe('chat_api_nlp_filtering');
    const [plain] = normalizeExtractionResponse(
      { items: [{ summary: 'New capability' }] },
      'new', 10, 2
    );
    expect(plain.previous_capability_key).toBeNull();
  });

  it('produces a deterministic evidence hash for identical inputs', () => {
    const events = [{ event_type: 'push', payload: { commits: [{ sha: 'abc', message: 'add retrieval' }] } }];
    const repo = [{ capability_key: 'retrieval', role: 'foundation', summary: 'Built earlier' }];
    const a = buildEvidenceHash(candidate, events, 'v5.0', [], repo);
    const b = buildEvidenceHash(candidate, events, 'v5.0', [], repo);
    expect(a).toBe(b);
  });

  it('builds a breakdown prompt even with minimal evidence and a null key', () => {
    const prompt = buildBreakdownPrompt({
      broadUnit: { summary: 'Ship everything at once', capability_key: null, role: 'feature', work_type: 'Feature' },
      title: 'Big change',
      commitMessages: [],
      changedFilePaths: [],
      codeEvidence: [],
      prBody: null,
    });
    expect(prompt).toContain('Ship everything at once');
    expect(prompt).toContain('(none)');
    expect(prompt).toContain('one work item per capability');
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

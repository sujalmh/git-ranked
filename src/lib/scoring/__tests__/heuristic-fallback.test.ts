import { describe, expect, it } from 'vitest';
import { classifyWorkTypeFromText, extractHeuristicFacts } from '../heuristic-fallback';

describe('heuristic fallback word-boundary regexes', () => {
  it('does not match debug as fix', () => {
    const workType = classifyWorkTypeFromText('Add debug logging to server');
    expect(workType).not.toBe('BugFix');
  });

  it('matches fix as BugFix', () => {
    const workType = classifyWorkTypeFromText('Fix null pointer crash');
    expect(workType).toBe('BugFix');
  });

  it('detects test and auth path heuristics', () => {
    const facts = extractHeuristicFacts('Update login session handler', ['src/auth/session.ts', 'src/auth/session.test.ts']);
    expect(facts.touches_auth).toBe(true);
    expect(facts.testing_added).toBe(true);
  });
});

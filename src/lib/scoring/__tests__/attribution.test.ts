import { describe, expect, it } from 'vitest';
import { collectCommitAuthors, computeAttributionWeights, type CommitAuthor } from '../attribution';

describe('attribution', () => {
  it('splits credit proportional to authored commits and sums to 1', () => {
    const authors: CommitAuthor[] = [
      { login: 'alice' },
      { login: 'alice' },
      { login: 'alice' },
      { login: 'bob' },
    ];

    const resolve = (a: CommitAuthor): number | null =>
      a.login === 'alice' ? 10 : a.login === 'bob' ? 20 : null;

    const weights = computeAttributionWeights(authors, resolve, 10);

    // alice: 1 (opener floor) + 3 authored = 4/5, bob: 1/5
    expect(weights.get(10)).toBeCloseTo(0.8, 2);
    expect(weights.get(20)).toBeCloseTo(0.2, 2);
    expect(Array.from(weights.values()).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('keeps the opener credited even when they authored zero commits', () => {
    const authors: CommitAuthor[] = [{ login: 'bob' }, { login: 'bob' }, { login: 'bob' }];

    const resolve = (a: CommitAuthor): number | null => (a.login === 'bob' ? 20 : null);

    const weights = computeAttributionWeights(authors, resolve, 10);

    expect(weights.has(10)).toBe(true);
    expect(weights.get(20)!).toBeGreaterThan(weights.get(10)!);
    expect(Array.from(weights.values()).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('unmatched authors fall back to the primary contributor', () => {
    const authors: CommitAuthor[] = [{ login: 'ghost' }, { login: 'ghost' }];
    const resolve = () => null;

    const weights = computeAttributionWeights(authors, resolve, 7);

    expect(weights.get(7)).toBeCloseTo(1, 5);
  });

  it('with no commit-author data all credit goes to the primary contributor', () => {
    const weights = computeAttributionWeights([], () => null, 3);
    expect(weights.get(3)).toBeCloseTo(1, 5);
    expect(weights.size).toBe(1);
  });

  it('collectCommitAuthors extracts authors from push payloads', () => {
    const events = [
      {
        payload: {
          commits: [
            { sha: 'a', author: { login: 'alice', email: 'a@x.com' } },
            { sha: 'b', author: { login: 'bob' } },
          ],
        },
      },
      { payload: { commits: [] } },
      { payload: {} },
    ];

    const authors = collectCommitAuthors(events);
    expect(authors).toHaveLength(2);
    expect(authors[0].login).toBe('alice');
  });
});

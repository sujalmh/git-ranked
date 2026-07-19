import type { RawEvent } from './scoring';

export type ContributionCategory = {
  label: string;
  detail: string;
  value: number;
};

export type ContributorInsight = {
  id: number;
  username: string;
  avatarUrl: string | null;
  score: ReturnType<typeof import('./scoring').computeContributionScore>;
  impactScore: number;
  commits: number;
  prsOpened: number;
  prsMerged: number;
  reviews: number;
  issues: number;
  releases: number;
  fixes: number;
  changedLines: number;
  additions: number;
  deletions: number;
  lastActive: Date | null;
  role: string;
  summary: string[];
  categories: ContributionCategory[];
  highlights: string[];
  events: RawEvent[];
};

export type Highlight = {
  date: Date;
  username: string;
  text: string;
};

export const FEATURE_WORDS = [
  'add', 'added', 'build', 'built', 'implement', 'implemented', 'create', 'created',
  'feature', 'dashboard', 'page', 'ui', 'api',
];

export const RELIABILITY_WORDS = [
  'fix', 'fixed', 'bug', 'error', 'edge', 'refactor', 'harden', 'improve',
  'improved', 'auth', 'oauth', 'database', 'db',
];

export function asPayload(payload: unknown): Record<string, unknown> {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof payload === 'object' && payload !== null) {
    return payload as Record<string, unknown>;
  }
  return {};
}

export function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function eventDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

export function formatRelativeDate(date: Date | null) {
  if (!date) return 'No activity yet';
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export function cleanTopic(text: string) {
  return text
    .replace(/^(feat|fix|chore|refactor|docs|style|test|perf)(\(.+\))?:\s*/i, '')
    .replace(/^merge pull request.+$/i, 'pull request work')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text: string, max = 78) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

export function titleFromPayload(type: string, payload: Record<string, unknown>) {
  if (type === 'push') {
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    const firstCommit = commits.find(
      (commit) => typeof commit === 'object' && commit !== null && 'message' in commit
    );
    if (
      firstCommit &&
      typeof firstCommit === 'object' &&
      'message' in firstCommit &&
      typeof firstCommit.message === 'string'
    ) {
      return cleanTopic(firstCommit.message.split('\n')[0]);
    }
  }

  return cleanTopic(
    asString(payload.title) ||
      asString(payload.name) ||
      asString(payload.tag_name) ||
      asString(payload.body) ||
      'repository work'
  );
}

export function containsAny(text: string, words: string[]) {
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word));
}

export function eventCategory(type: string, payload: Record<string, unknown>) {
  const title = titleFromPayload(type, payload);
  if (type === 'review_submitted') return 'Code Review';
  if (type.startsWith('issue_')) return 'Planning';
  if (type === 'release') return 'Releases';
  if (containsAny(title, RELIABILITY_WORDS)) return 'Reliability';
  if (containsAny(title, FEATURE_WORDS) || type.startsWith('pr_') || type === 'push') return 'Feature Work';
  return 'Maintenance';
}

export function isFix(type: string, payload: Record<string, unknown>) {
  const title = titleFromPayload(type, payload).toLowerCase();
  return (
    type !== 'review_submitted' &&
    ['fix', 'bug', 'error', 'edge case', 'broken', 'issue'].some((word) => title.includes(word))
  );
}

export function describeEvent(type: string, payload: Record<string, unknown>) {
  const topic = truncate(titleFromPayload(type, payload));

  if (type === 'pr_merged') return `Completed ${topic}`;
  if (type === 'pr_opened') return `Proposed ${topic}`;
  if (type === 'review_submitted') {
    const state = asString(payload.state).replace('_', ' ') || 'submitted';
    const number = asNumber(payload.pr_number);
    return `Reviewed PR #${number}${state ? ` with ${state}` : ''}`;
  }
  if (type === 'push') return `Advanced ${topic}`;
  if (type === 'issue_opened') return `Defined ${topic}`;
  if (type === 'issue_closed') return `Resolved ${topic}`;
  if (type === 'release') return `Released ${topic}`;
  return `Contributed to ${topic}`;
}

export function contributorRole(contributor: ContributorInsight) {
  const categories = [
    { label: 'Builder', value: contributor.commits + contributor.prsMerged * 3 + contributor.changedLines / 100 },
    { label: 'Reviewer', value: contributor.reviews * 2.5 },
    { label: 'Stabilizer', value: contributor.fixes * 3 + contributor.changedLines / 250 },
    { label: 'Planner', value: contributor.issues + contributor.prsOpened },
    { label: 'Release Driver', value: contributor.releases * 4 },
  ];
  return categories.sort((a, b) => b.value - a.value)[0]?.label ?? 'Contributor';
}

export function buildContributionCategories(
  contributor: ContributorInsight,
  categoryCounts: Map<string, number>
) {
  const categories = Array.from(categoryCounts.entries())
    .map(([label, value]) => ({
      label,
      value,
      detail: categoryDetail(label, contributor, value),
    }))
    .sort((a, b) => b.value - a.value);

  return categories.slice(0, 3);
}

export function categoryDetail(label: string, contributor: ContributorInsight, value: number) {
  if (label === 'Code Review') return `${pluralize(contributor.reviews, 'review')} that helped unblock teammates`;
  if (label === 'Reliability') return `${pluralize(contributor.fixes, 'fix')} or hardening change detected`;
  if (label === 'Feature Work')
    return `${pluralize(contributor.prsMerged + contributor.prsOpened + contributor.commits, 'shipping signal')} captured`;
  if (label === 'Planning') return `${pluralize(value, 'planning touchpoint')} through issues or PR setup`;
  if (label === 'Releases') return `${pluralize(contributor.releases, 'release')} published`;
  return `${pluralize(value, 'contribution')} in this lane`;
}

export function contributorSummary(contributor: ContributorInsight) {
  const bullets: string[] = [];
  const topHighlights = contributor.highlights
    .slice(0, 3)
    .map((highlight) => highlight.replace(/^(Completed|Proposed|Advanced|Defined|Resolved|Released)\s+/i, ''));
  const uniqueTopics = Array.from(new Set(topHighlights)).filter(Boolean);

  if (uniqueTopics[0]) bullets.push(`${contributor.prsMerged ? 'Shipped' : 'Worked on'} ${uniqueTopics[0]}`);
  if (uniqueTopics[1]) bullets.push(`Contributed to ${uniqueTopics[1]}`);
  if (contributor.reviews) bullets.push(`Reviewed ${pluralize(contributor.reviews, 'pull request')}`);
  if (contributor.fixes) bullets.push(`Fixed ${pluralize(contributor.fixes, 'stability issue')}`);
  if (contributor.changedLines) bullets.push(`Moved ${contributor.changedLines} lines of product/code change`);
  if (!bullets.length && contributor.commits)
    bullets.push(`Kept the repository moving with ${pluralize(contributor.commits, 'code update')}`);

  return bullets.slice(0, 5);
}

export function topBy<T>(contributors: T[], getValue: (c: T) => number): T | undefined {
  return contributors.filter((c) => getValue(c) > 0).sort((a, b) => getValue(b) - getValue(a))[0];
}

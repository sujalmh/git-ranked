import { containsAny, FEATURE_WORDS, RELIABILITY_WORDS } from '../contributor-insights';
import type { ClassificationItem, ContributorProfile, ImpactAnalysis, MonthlyReport, RepositorySummary, ReleaseNotes, TeamInsights, WeeklyReport } from './types';
import type { NormalizedEvent, TaskContext, WorkType } from './types';

const FIX_WORDS = ['fix', 'bug', 'error', 'broken', 'crash', 'issue'];
const PERF_WORDS = ['perf', 'performance', 'optim', 'speed', 'latency', 'cache'];
const SECURITY_WORDS = ['security', 'auth', 'vulnerab', 'cve', 'csrf', 'xss', 'injection'];
const REFACTOR_WORDS = ['refactor', 'cleanup', 'clean up', 'restructure', 'simplify'];
const INFRA_WORDS = ['ci', 'cd', 'deploy', 'docker', 'kubernetes', 'terraform', 'pipeline', 'build'];
const DOCS_WORDS = ['docs', 'documentation', 'readme', 'changelog'];
const TEST_WORDS = ['test', 'spec', 'coverage', 'mock'];
const DB_WORDS = ['migration', 'schema', 'database', 'sql', 'table', 'index'];
const API_WORDS = ['api', 'endpoint', 'route', 'graphql', 'rest'];
const FRONTEND_WORDS = ['ui', 'frontend', 'css', 'component', 'page', 'layout', 'button'];
const BACKEND_WORDS = ['backend', 'server', 'service', 'worker', 'queue', 'cron'];

const KEYWORD_GROUPS: Array<{ workType: WorkType; words: string[] }> = [
  { workType: 'Security', words: SECURITY_WORDS },
  { workType: 'Performance', words: PERF_WORDS },
  { workType: 'Testing', words: TEST_WORDS },
  { workType: 'Database', words: DB_WORDS },
  { workType: 'Infrastructure', words: INFRA_WORDS },
  { workType: 'Documentation', words: DOCS_WORDS },
  { workType: 'Bug Fix', words: FIX_WORDS },
  { workType: 'Refactor', words: REFACTOR_WORDS },
  { workType: 'API', words: API_WORDS },
  { workType: 'Frontend', words: FRONTEND_WORDS },
  { workType: 'Backend', words: BACKEND_WORDS },
  { workType: 'Feature', words: FEATURE_WORDS },
];

export function classifyEventFallback(event: {
  id: number;
  type: string;
  title: string;
}): ClassificationItem {
  const title = event.title.toLowerCase();

  if (event.type === 'review_submitted') {
    return {
      event_id: event.id,
      categories: ['Code Review'],
      work_type: 'Other',
      work_area: 'Other',
      technologies: [],
      confidence: 0.9,
      reasoning: 'Review submitted — classified as code review activity.',
    };
  }

  if (event.type === 'release') {
    return {
      event_id: event.id,
      categories: ['Releases'],
      work_type: 'Feature',
      work_area: 'Other',
      technologies: [],
      confidence: 0.8,
      reasoning: 'Release published — classified as feature delivery.',
    };
  }

  const matched: WorkType[] = [];
  for (const group of KEYWORD_GROUPS) {
    if (containsAny(title, group.words)) {
      matched.push(group.workType);
    }
  }

  const workType = matched[0] ?? 'Other';
  const categories: string[] = [];
  if (containsAny(title, RELIABILITY_WORDS)) categories.push('Reliability');
  if (containsAny(title, FEATURE_WORDS)) categories.push('Feature Work');
  if (!categories.length) categories.push(event.type.startsWith('issue_') ? 'Planning' : 'Maintenance');

  const confidence = matched.length > 0 ? 0.6 : 0.3;
  const workArea = matched.length ? matched[0] : 'Other';

  return {
    event_id: event.id,
    categories,
    work_type: workType,
    work_area: workArea,
    technologies: [],
    confidence,
    reasoning: matched.length
      ? `Keyword match: "${matched.join(', ')}" detected in title.`
      : 'No strong keyword signal; classified as Other with low confidence.',
  };
}

export function classifyEventsFallback(events: NormalizedEvent[]): { items: ClassificationItem[] } {
  return {
    items: events.map((e) =>
      classifyEventFallback({ id: e.id, type: e.type, title: e.title })
    ),
  };
}

export function contributorProfileFallback(ctx: TaskContext): ContributorProfile {
  const stats = ctx.contributorStats;
  const events = ctx.events;

  const focusAreas = new Set<string>();
  for (const e of events) {
    if (e.classification?.work_type) focusAreas.add(e.classification.work_type);
    else if (e.category) focusAreas.add(e.category);
  }

  const accomplishments: string[] = [];
  if (stats) {
    if (stats.prsMerged > 0) accomplishments.push(`Merged ${stats.prsMerged} pull request(s)`);
    if (stats.reviews > 0) accomplishments.push(`Submitted ${stats.reviews} review(s)`);
    if (stats.commits > 0) accomplishments.push(`Pushed ${stats.commits} commit(s)`);
    if (stats.releases > 0) accomplishments.push(`Published ${stats.releases} release(s)`);
    if (stats.fixes > 0) accomplishments.push(`Delivered ${stats.fixes} fix(es)`);
    if (stats.changedLines > 0) accomplishments.push(`Changed ${stats.changedLines} lines of code`);
  }
  if (!accomplishments.length) accomplishments.push('Contributed to repository activity during this period.');

  const strengths: string[] = [];
  if (stats) {
    if (stats.prsMerged >= 3) strengths.push('Consistent feature delivery');
    if (stats.reviews >= 3) strengths.push('Active code reviewer');
    if (stats.fixes >= 2) strengths.push('Reliability-focused');
    if (stats.activeDays >= 5) strengths.push('Regular contributor');
  }
  if (!strengths.length) strengths.push('Contributing to the codebase');

  const summary = stats
    ? `${ctx.contributorUsername ?? 'Contributor'} was active across ${stats.activeDays} day(s), with ${stats.prsMerged} merged PR(s) and ${stats.reviews} review(s). Primary focus: ${Array.from(focusAreas).slice(0, 3).join(', ') || 'general development'}.`
    : `${ctx.contributorUsername ?? 'Contributor'} was active during this period.`;

  return {
    summary,
    strengths,
    focus_areas: Array.from(focusAreas).slice(0, 5),
    accomplishments,
    concerns: [],
    confidence: 0.5,
  };
}

export function repositorySummaryFallback(ctx: TaskContext): RepositorySummary {
  const events = ctx.events;
  const completedFeatures = events
    .filter((e) => e.type === 'pr_merged' && e.classification?.work_type === 'Feature')
    .map((e) => e.title)
    .slice(0, 10);
  const technicalChanges = events
    .filter((e) => e.type === 'pr_merged' && e.classification?.work_type !== 'Feature')
    .map((e) => e.title)
    .slice(0, 10);

  const contributors = new Set(events.map((e) => e.username));
  const merged = events.filter((e) => e.type === 'pr_merged').length;
  const reviews = events.filter((e) => e.type === 'review_submitted').length;

  return {
    overview: `Repository ${ctx.repoOwner}/${ctx.repoName} had ${events.length} events from ${contributors.size} contributor(s) between ${ctx.dateFrom} and ${ctx.dateTo}. ${merged} PR(s) merged, ${reviews} review(s) submitted.`,
    highlights: events.filter((e) => e.type === 'pr_merged' || e.type === 'release').map((e) => e.description).slice(0, 8),
    completed_features: completedFeatures,
    technical_changes: technicalChanges,
    risks: [],
    next_focus: [],
  };
}

export function releaseNotesFallback(ctx: TaskContext): ReleaseNotes {
  const events = ctx.events;
  const features = events
    .filter((e) => e.type === 'pr_merged' && e.classification?.work_type === 'Feature')
    .map((e) => e.title)
    .slice(0, 15);
  const fixes = events
    .filter((e) => (e.type === 'pr_merged' || e.type === 'issue_closed') && e.classification?.work_type === 'Bug Fix')
    .map((e) => e.title)
    .slice(0, 15);
  const improvements = events
    .filter((e) => e.type === 'pr_merged' && ['Performance', 'Refactor', 'Infrastructure'].includes(e.classification?.work_type ?? ''))
    .map((e) => e.title)
    .slice(0, 10);

  return {
    summary: `${features.length} feature(s), ${fixes.length} fix(es), and ${improvements.length} improvement(s) between ${ctx.dateFrom} and ${ctx.dateTo}.`,
    features,
    fixes,
    improvements,
    breaking_changes: [],
    other: [],
  };
}

export function impactAnalysisFallback(ctx: TaskContext): ImpactAnalysis {
  const stats = ctx.contributorStats;
  const breakdown = ctx.scoreBreakdown?.breakdown;

  const signals: string[] = [];
  if (stats) {
    if (stats.prsMerged > 0) signals.push(`${stats.prsMerged} merged PR(s)`);
    if (stats.reviews > 0) signals.push(`${stats.reviews} review(s)`);
    if (stats.commits > 0) signals.push(`${stats.commits} commit(s)`);
    if (stats.fixes > 0) signals.push(`${stats.fixes} fix(es)`);
  }

  const role = deriveRole(stats);
  const topDimension = breakdown
    ? Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]
    : null;

  const explanation = stats
    ? `${ctx.contributorUsername ?? 'Contributor'} contributed across ${stats.activeDays} day(s). ` +
      `Strongest dimension: ${topDimension ? topDimension[0] : 'overall activity'}. ` +
      `Key signals: ${signals.join(', ') || 'general activity'}.`
    : `${ctx.contributorUsername ?? 'Contributor'} was active during this period.`;

  return {
    explanation,
    contributor_role: role,
    key_signals: signals,
    confidence: 0.5,
  };
}

function deriveRole(stats: TaskContext['contributorStats']): string {
  if (!stats) return 'Contributor';
  const scores = [
    { label: 'Builder', value: stats.commits + stats.prsMerged * 3 + stats.changedLines / 100 },
    { label: 'Reviewer', value: stats.reviews * 2.5 },
    { label: 'Stabilizer', value: stats.fixes * 3 + stats.changedLines / 250 },
    { label: 'Planner', value: stats.issues + stats.prsOpened },
    { label: 'Release Driver', value: stats.releases * 4 },
  ];
  return scores.sort((a, b) => b.value - a.value)[0]?.label ?? 'Contributor';
}

export function teamInsightsFallback(ctx: TaskContext): TeamInsights {
  const events = ctx.events;
  const contributorActivity = new Map<string, number>();
  for (const e of events) {
    contributorActivity.set(e.username, (contributorActivity.get(e.username) ?? 0) + 1);
  }

  const sorted = Array.from(contributorActivity.entries()).sort((a, b) => b[1] - a[1]);
  const total = events.length;

  const reviewCount = events.filter((e) => e.type === 'review_submitted').length;
  const prCount = events.filter((e) => e.type === 'pr_merged' || e.type === 'pr_opened').length;
  const reviewRatio = prCount > 0 ? reviewCount / prCount : 0;

  const reviewBottlenecks: string[] = [];
  if (prCount > 0 && reviewRatio < 0.5) {
    reviewBottlenecks.push(`Low review coverage: ${reviewCount} reviews for ${prCount} pull requests.`);
  }

  const singleOwnerModules: string[] = [];
  if (sorted.length > 0) {
    const topShare = sorted[0][1] / total;
    if (topShare > 0.6 && sorted.length > 1) {
      singleOwnerModules.push(`${sorted[0][0]} accounts for ${Math.round(topShare * 100)}% of all activity — potential bus factor risk.`);
    }
  }

  const risingContributors = sorted.slice(-2).filter(([, count]) => count > 0).map(([name]) => name);

  const quietAreas: string[] = [];
  const types = new Set(events.map((e) => e.type));
  if (!types.has('review_submitted')) quietAreas.push('No code reviews observed in this period.');
  if (!types.has('release')) quietAreas.push('No releases published in this period.');

  return {
    review_bottlenecks: reviewBottlenecks,
    single_owner_modules: singleOwnerModules,
    rising_contributors: risingContributors,
    quiet_areas: quietAreas,
  };
}

export function weeklyReportFallback(ctx: TaskContext): WeeklyReport {
  const summary = repositorySummaryFallback(ctx);
  return {
    overview: summary.overview,
    themes: Array.from(new Set(ctx.events.map((e) => e.classification?.work_type ?? e.category))).slice(0, 5),
    shipped: summary.completed_features,
    risks: summary.risks,
    next_week: [],
  };
}

export function monthlyReportFallback(ctx: TaskContext): MonthlyReport {
  const summary = repositorySummaryFallback(ctx);
  return {
    overview: summary.overview,
    themes: Array.from(new Set(ctx.events.map((e) => e.classification?.work_type ?? e.category))).slice(0, 5),
    shipped: summary.completed_features,
    risks: summary.risks,
    next_month: [],
  };
}

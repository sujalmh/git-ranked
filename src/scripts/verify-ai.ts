import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import {
  ContributorProfileSchema,
  RepositorySummarySchema,
  ImpactAnalysisSchema,
  TeamInsightsSchema,
  WeeklyReportSchema,
  MonthlyReportSchema,
  ClassificationSchema,
} from '../lib/ai/schemas';
import { classifyEventsFallback, contributorProfileFallback, repositorySummaryFallback, impactAnalysisFallback, teamInsightsFallback, weeklyReportFallback, monthlyReportFallback } from '../lib/ai/fallback';
import type { TaskContext, NormalizedEvent } from '../lib/ai/types';
import { computeContributionScore } from '../lib/scoring';

function makeFixtureEvents(): NormalizedEvent[] {
  return [
    {
      id: 1,
      type: 'pr_merged',
      username: 'alice',
      createdAt: '2026-07-15T10:00:00Z',
      title: 'Add user authentication with OAuth',
      description: 'Completed Add user authentication with OAuth',
      category: 'Feature Work',
      additions: 250,
      deletions: 30,
      changedFiles: 8,
      classification: {
        event_id: 1,
        categories: ['Feature Work'],
        work_type: 'Feature',
        work_areas: ['Auth', 'API'],
        technologies: ['OAuth'],
        confidence: 0.9,
        reasoning: 'Title indicates new auth feature.',
      },
    },
    {
      id: 2,
      type: 'pr_merged',
      username: 'bob',
      createdAt: '2026-07-16T14:00:00Z',
      title: 'Fix memory leak in connection pool',
      description: 'Completed Fix memory leak in connection pool',
      category: 'Reliability',
      additions: 15,
      deletions: 8,
      changedFiles: 2,
      classification: {
        event_id: 2,
        categories: ['Reliability'],
        work_type: 'Bug Fix',
        work_areas: ['Database'],
        technologies: [],
        confidence: 0.85,
        reasoning: 'Title indicates a bug fix.',
      },
    },
    {
      id: 3,
      type: 'review_submitted',
      username: 'charlie',
      createdAt: '2026-07-17T09:00:00Z',
      title: 'pull request work',
      description: 'Reviewed PR #42 with approved',
      category: 'Code Review',
    },
    {
      id: 4,
      type: 'release',
      username: 'alice',
      createdAt: '2026-07-18T16:00:00Z',
      title: 'v2.0.0',
      description: 'Released v2.0.0',
      category: 'Releases',
    },
    {
      id: 5,
      type: 'push',
      username: 'bob',
      createdAt: '2026-07-19T11:00:00Z',
      title: 'refactor database queries',
      description: 'Advanced refactor database queries',
      category: 'Reliability',
    },
  ];
}

function makeFixtureContext(): TaskContext {
  const events = makeFixtureEvents();
  return {
    repoId: 1,
    repoOwner: 'test-org',
    repoName: 'test-repo',
    dateFrom: '2026-07-15',
    dateTo: '2026-07-19',
    contributorId: 1,
    contributorUsername: 'alice',
    events,
    contributorStats: {
      commits: 10,
      prsOpened: 3,
      prsMerged: 5,
      reviews: 2,
      issues: 4,
      releases: 1,
      fixes: 2,
      changedLines: 450,
      activeDays: 5,
    },
    scoreBreakdown: computeContributionScore(
      events.map(e => ({ type: e.type, payload: {}, created_at: e.createdAt, id: e.id })),
      { classifications: new Map(events.filter(e => e.classification).map(e => [e.id, e.classification!])) }
    ),
  };
}

type ValidationResult = {
  name: string;
  passed: boolean;
  error?: string;
};

function validateSchema<T>(name: string, schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: unknown[] } } }, data: T): ValidationResult {
  const result = schema.safeParse(data);
  if (result.success) {
    return { name, passed: true };
  }
  return { name, passed: false, error: JSON.stringify(result.error?.issues?.slice(0, 2)) };
}

async function main() {
  const ctx = makeFixtureContext();
  const results: ValidationResult[] = [];

  console.log('--- AI Fixture Validator ---\n');

  // Test classification fallback
  const classificationResult = classifyEventsFallback(ctx.events);
  results.push(validateSchema('Classification (fallback)', ClassificationSchema, classificationResult));

  // Test contributor profile fallback
  const profileResult = contributorProfileFallback(ctx);
  results.push(validateSchema('Contributor Profile (fallback)', ContributorProfileSchema, profileResult));

  // Test repository summary fallback
  const summaryResult = repositorySummaryFallback(ctx);
  results.push(validateSchema('Repository Summary (fallback)', RepositorySummarySchema, summaryResult));


  // Test impact analysis fallback
  const impactResult = impactAnalysisFallback(ctx);
  results.push(validateSchema('Impact Analysis (fallback)', ImpactAnalysisSchema, impactResult));

  // Test team insights fallback
  const teamResult = teamInsightsFallback(ctx);
  results.push(validateSchema('Team Insights (fallback)', TeamInsightsSchema, teamResult));

  // Test weekly report fallback
  const weeklyResult = weeklyReportFallback(ctx);
  results.push(validateSchema('Weekly Report (fallback)', WeeklyReportSchema, weeklyResult));

  // Test monthly report fallback
  const monthlyResult = monthlyReportFallback(ctx);
  results.push(validateSchema('Monthly Report (fallback)', MonthlyReportSchema, monthlyResult));

  // Print results
  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${status}] ${r.name}`);
    if (!r.passed) {
      allPassed = false;
      console.log(`         ${r.error}`);
    }
  }

  console.log(`\n${allPassed ? 'All validations passed.' : 'Some validations failed.'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fixture validator crashed:', err);
  process.exit(1);
});

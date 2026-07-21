import type { z } from 'zod';
import type { HealthMetrics } from '../insights';
import type { ScoreDetails } from '../scoring';
import type {
  ClassificationSchema,
  ContributorProfileSchema,
  RepositorySummarySchema,
  ImpactAnalysisSchema,
  TeamInsightsSchema,
  WeeklyReportSchema,
  MonthlyReportSchema,
} from './schemas';

export type WorkType =
  | 'Feature'
  | 'Bug Fix'
  | 'Performance'
  | 'Security'
  | 'Refactor'
  | 'Infrastructure'
  | 'Documentation'
  | 'Testing'
  | 'Database'
  | 'API'
  | 'Frontend'
  | 'Backend'
  | 'Other';

export const WORK_TYPES: WorkType[] = [
  'Feature',
  'Bug Fix',
  'Performance',
  'Security',
  'Refactor',
  'Infrastructure',
  'Documentation',
  'Testing',
  'Database',
  'API',
  'Frontend',
  'Backend',
  'Other',
];

export type Classification = z.infer<typeof ClassificationSchema>;
export type ClassificationItem = Classification['items'][number];

export type DiffFacts = {
  files_changed: number;
  directories: string[];
  languages: string[];
  insertions: number;
  deletions: number;
  renamed: number;
  dependency_updates: string[];
  tests_added: number;
  migrations: number;
  docs_updated: number;
  fetched_at: string | null;
};

export type NormalizedEvent = {
  id: number;
  type: string;
  username: string;
  createdAt: string;
  title: string;
  description: string;
  category: string;
  prNumber?: number;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  diffFacts?: DiffFacts;
  classification?: ClassificationItem;
};

export type TaskContext = {
  repoId: number;
  repoOwner: string;
  repoName: string;
  dateFrom: string;
  dateTo: string;
  contributorId?: number;
  contributorUsername?: string;
  events: NormalizedEvent[];
  previousSummary?: unknown;
  healthMetrics?: HealthMetrics;
  scoreBreakdown?: ScoreDetails;
  contributorStats?: {
    commits: number;
    prsOpened: number;
    prsMerged: number;
    reviews: number;
    issues: number;
    releases: number;
    fixes: number;
    changedLines: number;
    activeDays: number;
  };
};

export type TaskStorage = 'ai_summaries' | 'insight_caches';

export type AiTask<T> = {
  id: string;
  storage: TaskStorage;
  schema: z.ZodType<T>;
  schemaVersion: string;
  promptVersion: string;
  cacheTtlHours: number;
  buildPrompt: (ctx: TaskContext) => { system: string; user: string };
  fallback?: (ctx: TaskContext) => T;
};

export type AiResult<T> = {
  payload: T;
  confidence: number;
  source: 'ai' | 'fallback';
  modelUsed: string;
  generatedAt: Date;
};

export type ContributorProfile = z.infer<typeof ContributorProfileSchema>;
export type RepositorySummary = z.infer<typeof RepositorySummarySchema>;
export type ImpactAnalysis = z.infer<typeof ImpactAnalysisSchema>;
export type TeamInsights = z.infer<typeof TeamInsightsSchema>;
export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;
export type MonthlyReport = z.infer<typeof MonthlyReportSchema>;

import { z } from 'zod';

const confidenceField = z.number().min(0).max(1);
const stringArray = z.array(z.string());

export const ClassificationItemSchema = z.object({
  event_id: z.number(),
  categories: stringArray,
  work_type: z.string(),
  technologies: stringArray,
  confidence: confidenceField,
  reasoning: z.string(),
});
export type ClassificationItemSchemaType = z.infer<typeof ClassificationItemSchema>;

export const ClassificationSchema = z.object({
  items: z.array(ClassificationItemSchema),
});

export const ContributorProfileSchema = z.object({
  summary: z.string(),
  strengths: stringArray,
  focus_areas: stringArray,
  accomplishments: stringArray,
  concerns: stringArray,
  confidence: confidenceField,
});

export const RepositorySummarySchema = z.object({
  overview: z.string(),
  highlights: stringArray,
  completed_features: stringArray,
  technical_changes: stringArray,
  risks: stringArray,
  next_focus: stringArray,
});

export const ReleaseNotesSchema = z.object({
  summary: z.string(),
  features: stringArray,
  fixes: stringArray,
  improvements: stringArray,
  breaking_changes: stringArray,
  other: stringArray,
});

export const ImpactAnalysisSchema = z.object({
  explanation: z.string(),
  contributor_role: z.string(),
  key_signals: stringArray,
  confidence: confidenceField,
});

export const TeamInsightsSchema = z.object({
  review_bottlenecks: stringArray,
  single_owner_modules: stringArray,
  rising_contributors: stringArray,
  quiet_areas: stringArray,
});

export const WeeklyReportSchema = z.object({
  overview: z.string(),
  themes: stringArray,
  shipped: stringArray,
  risks: stringArray,
  next_week: stringArray,
});

export const MonthlyReportSchema = z.object({
  overview: z.string(),
  themes: stringArray,
  shipped: stringArray,
  risks: stringArray,
  next_month: stringArray,
});

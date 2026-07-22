import { z } from 'zod';

export const ScopeSchema = z.enum(['trivial', 'small', 'medium', 'large', 'system_wide']);

export const WorkTypeSchema = z.enum([
  'Feature',
  'BugFix',
  'Refactor',
  'Performance',
  'Security',
  'Documentation',
  'Testing',
  'Infrastructure',
  'Review',
]);

export const FactsSchema = z.object({
  scope: ScopeSchema,
  user_visible: z.boolean(),
  breaking_change: z.boolean(),
  cross_cutting: z.boolean(),
  testing_added: z.boolean(),
  documentation_updated: z.boolean(),
  new_algorithm_or_subsystem: z.boolean(),
  boilerplate: z.boolean(),
  touches_auth: z.boolean(),
  touches_data_migration: z.boolean(),
  touches_distributed_state: z.boolean(),
  touches_architecture: z.boolean(),
});

export const ReviewFactsSchema = z.object({
  substantiveness: z.enum(['rubber_stamp', 'light', 'moderate', 'thorough']),
  blocking_issue_found: z.boolean(),
  confirmed_valid: z.boolean(),
});

export const WorkUnitExtractionItemSchema = z.object({
  work_type: WorkTypeSchema,
  summary: z.string(),
  facts: FactsSchema,
  confidence: z.number(),
});

export const WorkUnitExtractionResponseSchema = z.object({
  items: z.array(WorkUnitExtractionItemSchema),
});

export const ReviewExtractionItemSchema = z.object({
  facts: ReviewFactsSchema,
  summary: z.string(),
  confidence: z.number(),
});

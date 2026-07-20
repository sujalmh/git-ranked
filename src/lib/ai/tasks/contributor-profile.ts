import { ContributorProfileSchema } from '../schemas';
import {
  buildClassificationRollup,
  buildContributorStatsBlock,
  buildEventContextBlock,
} from '../context';
import { formatPreviousSummary } from '../memory';
import { contributorProfileFallback } from '../fallback';
import type { AiTask, ContributorProfile } from '../types';

export const contributorProfileTask: AiTask<ContributorProfile> = {
  id: 'contributor_profile',
  storage: 'insight_caches',
  schema: ContributorProfileSchema,
  schemaVersion: '1.0.0',
  promptVersion: '1.0.0',
  cacheTtlHours: 6,

  buildPrompt: (ctx) => {
    const system = `You are an Engineering Intelligence analyzer profiling a contributor based on observable GitHub activity.

Rules:
- Base every statement on the provided events only. Do NOT invent accomplishments or infer skills without evidence.
- Be concise and objective — this is an engineering analysis, not a performance review.
- summary MUST be a concise 1-2 sentence executive bio focused ONLY on the contributor's overall role and primary domain focus (e.g., "Full-stack developer primarily focused on NL query chat and backend APIs."). Do NOT list activity counts, events, or accomplishments here.
- Focus areas MUST be extremely concise 1-3 word topic tags (e.g., "API Integration", "Refactoring", "Testing"), NOT descriptive sentences, explanations, or lists of events.
- Strengths and concerns should be grounded in specific activity patterns (e.g., "Active reviewer" if reviews > 0).
- Include a confidence score (0-1) reflecting how much evidence you had.`;

    const statsBlock = buildContributorStatsBlock(ctx.contributorStats);
    const eventBlock = buildEventContextBlock(ctx.events, 40);
    const rollup = buildClassificationRollup(ctx.events);
    const memory = formatPreviousSummary(ctx.previousSummary);

    const user = `Contributor: ${ctx.contributorUsername ?? 'Unknown'}
Repository: ${ctx.repoOwner}/${ctx.repoName}
Period: ${ctx.dateFrom} to ${ctx.dateTo}

Statistics:
${statsBlock}

Work type distribution: ${rollup}

Activity:
${eventBlock}
${memory ? `\nPrevious profile context:\n${memory}` : ''}

Produce a contributor profile as JSON matching this schema:
{ "summary": string, "strengths": string[], "focus_areas": string[], "accomplishments": string[], "concerns": string[], "confidence": number }`;

    return { system, user };
  },

  fallback: contributorProfileFallback,
};

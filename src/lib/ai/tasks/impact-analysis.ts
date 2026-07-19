import { ImpactAnalysisSchema } from '../schemas';
import { buildContributorStatsBlock, buildEventContextBlock } from '../context';
import { impactAnalysisFallback } from '../fallback';
import type { AiTask, ImpactAnalysis } from '../types';

export const impactAnalysisTask: AiTask<ImpactAnalysis> = {
  id: 'impact_analysis',
  storage: 'insight_caches',
  schema: ImpactAnalysisSchema,
  schemaVersion: '1.0.0',
  promptVersion: '1.0.0',
  cacheTtlHours: 6,

  buildPrompt: (ctx) => {
    const system = `You are an Engineering Intelligence analyzer explaining a contributor's impact.

Rules:
- The numeric score breakdown is provided deterministically — your job is to EXPLAIN it, not invent numbers.
- Reference specific observed activity (merged PRs, reviews, fixes) as evidence.
- Identify the contributor's primary role based on their activity distribution.
- Key signals should be factual observations (e.g., "Merged 5 PRs in 7 days").
- Do NOT generate or suggest numeric scores.
- Include a confidence score (0-1) reflecting evidence strength.`;

    const statsBlock = buildContributorStatsBlock(ctx.contributorStats);
    const eventBlock = buildEventContextBlock(ctx.events, 30);
    const breakdown = ctx.scoreBreakdown;

    const breakdownBlock = breakdown
      ? `Deterministic score breakdown:
Total: ${breakdown.total}
Feature Delivery: ${breakdown.breakdown.featureDelivery}
Code Quality: ${breakdown.breakdown.codeQuality}
Reviews: ${breakdown.breakdown.reviews}
Collaboration: ${breakdown.breakdown.collaboration}
Consistency: ${breakdown.breakdown.consistency}`
      : 'No score breakdown provided.';

    const user = `Contributor: ${ctx.contributorUsername ?? 'Unknown'}
Repository: ${ctx.repoOwner}/${ctx.repoName}
Period: ${ctx.dateFrom} to ${ctx.dateTo}

${breakdownBlock}

Statistics:
${statsBlock}

Activity:
${eventBlock}

Explain this contributor's impact as JSON matching this schema:
{ "explanation": string, "contributor_role": string, "key_signals": string[], "confidence": number }`;

    return { system, user };
  },

  fallback: impactAnalysisFallback,
};

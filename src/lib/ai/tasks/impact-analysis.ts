import { ImpactAnalysisSchema } from '../schemas';
import { buildContributorStatsBlock, buildEventContextBlock } from '../context';
import { impactAnalysisFallback } from '../fallback';
import type { AiTask, ImpactAnalysis } from '../types';

export const impactAnalysisTask: AiTask<ImpactAnalysis> = {
  id: 'impact_analysis',
  storage: 'insight_caches',
  schema: ImpactAnalysisSchema,
  schemaVersion: '1.0.0',
  promptVersion: '1.1.0',
  cacheTtlHours: 6,

  buildPrompt: (ctx) => {
    const displayedScore = ctx.scoreBreakdown
      ? Math.max(1, Math.min(100, Math.round(ctx.scoreBreakdown.total)))
      : null;

    const system = `You are an Engineering Intelligence analyzer explaining a contributor's impact.

Rules:
- The Impact Score shown on the contributor's card is ${displayedScore ?? 'N/A'}/100. Your explanation MUST be consistent with that exact number.
- The score is the rounded sum of 5 deterministic components, each with a hard cap: Feature Delivery (cap 30), Code Quality (cap 20), Review Health (cap 25), Collaboration (cap 15), Consistency (cap 10).
- Explain WHY each component scored what it did, grounded in the provided statistics and observed activity. Note that Feature Delivery credits opened PRs (work in progress) as well as merged PRs, so a contributor driving a multi-PR effort still earns Feature Delivery credit before merge.
- Do NOT restate a different total, round differently, or invent any numbers. Only reference the component values provided below.
- Do NOT repeat general activity summaries or re-describe what features were built; the contributor profile already covers that.
- Identify the contributor's primary role based on their activity distribution.
- Key signals should be factual observations (e.g., "Merged 5 PRs in 7 days").
- Include a confidence score (0-1) reflecting evidence strength.`;

    const statsBlock = buildContributorStatsBlock(ctx.contributorStats);
    const eventBlock = buildEventContextBlock(ctx.events, 30);
    const breakdown = ctx.scoreBreakdown;

    const breakdownBlock = breakdown
      ? `Deterministic Impact Score breakdown (displayed score = ${displayedScore}/100, the rounded sum of the components below):
- Feature Delivery: ${breakdown.breakdown.featureDelivery} / 30
- Code Quality: ${breakdown.breakdown.codeQuality} / 20
- Review Health: ${breakdown.breakdown.reviews} / 25
- Collaboration: ${breakdown.breakdown.collaboration} / 15
- Consistency: ${breakdown.breakdown.consistency} / 10`
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

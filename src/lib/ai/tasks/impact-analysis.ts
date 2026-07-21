import { ImpactAnalysisSchema } from '../schemas';
import { buildContributorStatsBlock, buildEventContextBlock } from '../context';
import { impactAnalysisFallback } from '../fallback';
import type { AiTask, ImpactAnalysis } from '../types';

export const impactAnalysisTask: AiTask<ImpactAnalysis> = {
  id: 'impact_analysis',
  storage: 'insight_caches',
  schema: ImpactAnalysisSchema,
  schemaVersion: '1.0.0',
  promptVersion: '1.2.0',
  cacheTtlHours: 6,

  buildPrompt: (ctx) => {
    const displayedScore = ctx.scoreBreakdown
      ? Math.max(1, Math.min(100, Math.round(ctx.scoreBreakdown.total)))
      : null;

    const system = `You are an Engineering Intelligence analyzer explaining a contributor's impact.

Rules:
- explanation MUST be a concise, qualitative 1-2 sentence narrative summarizing what engineering work was accomplished or impacted (e.g., features shipped, PRs reviewed, bug fixes delivered). The numerical Impact Score and its component values are already rendered separately in the UI layout, so do NOT include them in the explanation.
- Do NOT restate numerical score formulas or component point values in explanation (e.g., "Impact Score is ${displayedScore ?? 'X'}/100, the rounded sum of...", "Feature Delivery 30/30", "earned 25 points for reviews"). The explanation must be purely qualitative and contain no score numbers, formulas, or component tallies.
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

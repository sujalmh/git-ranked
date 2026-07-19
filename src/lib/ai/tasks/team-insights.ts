import { TeamInsightsSchema } from '../schemas';
import { buildClassificationRollup, buildEventContextBlock } from '../context';
import { teamInsightsFallback } from '../fallback';
import type { AiTask, TeamInsights } from '../types';

export const teamInsightsTask: AiTask<TeamInsights> = {
  id: 'team_insights',
  storage: 'ai_summaries',
  schema: TeamInsightsSchema,
  schemaVersion: '1.0.0',
  promptVersion: '1.0.0',
  cacheTtlHours: 12,

  buildPrompt: (ctx) => {
    const system = `You are an Engineering Intelligence analyzer detecting team dynamics from repository activity.

Focus on:
- Review bottlenecks: PRs opened but not reviewed, or long review cycles.
- Single-owner modules: areas where one contributor dominates.
- Rising contributors: contributors increasing in activity.
- Quiet areas: activity types or areas with little or no activity.

Rules:
- Base every insight on observable patterns in the data.
- Do NOT infer interpersonal dynamics or attitudes.
- Be concise and specific.
- If no evidence for a category, return an empty array.`;

    const eventBlock = buildEventContextBlock(ctx.events, 80);
    const rollup = buildClassificationRollup(ctx.events);
    const contributors = new Map<string, number>();
    for (const e of ctx.events) {
      contributors.set(e.username, (contributors.get(e.username) ?? 0) + 1);
    }
    const contributorBlock = Array.from(contributors.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name}: ${count} events`)
      .join('\n');

    const user = `Repository: ${ctx.repoOwner}/${ctx.repoName}
Period: ${ctx.dateFrom} to ${ctx.dateTo}
Events: ${ctx.events.length}
Work distribution: ${rollup}

Contributor activity:
${contributorBlock}

Activity feed:
${eventBlock}

Produce team insights as JSON matching this schema:
{ "review_bottlenecks": string[], "single_owner_modules": string[], "rising_contributors": string[], "quiet_areas": string[] }`;

    return { system, user };
  },

  fallback: teamInsightsFallback,
};

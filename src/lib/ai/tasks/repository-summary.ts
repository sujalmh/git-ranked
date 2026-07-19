import { RepositorySummarySchema } from '../schemas';
import {
  buildClassificationRollup,
  buildEventContextBlock,
} from '../context';
import { formatPreviousSummary } from '../memory';
import { repositorySummaryFallback } from '../fallback';
import type { AiTask, RepositorySummary } from '../types';

export const repositorySummaryTask: AiTask<RepositorySummary> = {
  id: 'repository_summary',
  storage: 'ai_summaries',
  schema: RepositorySummarySchema,
  schemaVersion: '1.0.0',
  promptVersion: '1.0.0',
  cacheTtlHours: 12,

  buildPrompt: (ctx) => {
    const system = `You are an Engineering Intelligence analyzer summarizing repository activity.

Rules:
- Summarize what was accomplished, not just list events.
- Focus on impact and shipped work.
- Base everything on the provided evidence. Do NOT invent features or changes.
- Technical changes should describe actual code/architecture work observed.
- Risks should be grounded in observable patterns (e.g., low review coverage, single contributor).
- Be concise and objective.`;

    const eventBlock = buildEventContextBlock(ctx.events, 60);
    const rollup = buildClassificationRollup(ctx.events);
    const memory = formatPreviousSummary(ctx.previousSummary);
    const contributors = new Set(ctx.events.map((e) => e.username)).size;

    const user = `Repository: ${ctx.repoOwner}/${ctx.repoName}
Period: ${ctx.dateFrom} to ${ctx.dateTo}
Contributors: ${contributors}
Events: ${ctx.events.length}
Work distribution: ${rollup}

Activity:
${eventBlock}
${memory ? `\nPrevious summary (build upon, do not contradict):\n${memory}` : ''}

Produce a repository summary as JSON matching this schema:
{ "overview": string, "highlights": string[], "completed_features": string[], "technical_changes": string[], "risks": string[], "next_focus": string[] }`;

    return { system, user };
  },

  fallback: repositorySummaryFallback,
};

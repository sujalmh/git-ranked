import { WeeklyReportSchema } from '../schemas';
import { buildClassificationRollup, buildEventContextBlock } from '../context';
import { formatPreviousSummary } from '../memory';
import { weeklyReportFallback } from '../fallback';
import type { AiTask, WeeklyReport } from '../types';

export const weeklyReportTask: AiTask<WeeklyReport> = {
  id: 'weekly_report',
  storage: 'ai_summaries',
  schema: WeeklyReportSchema,
  schemaVersion: '1.0.0',
  promptVersion: '1.0.0',
  cacheTtlHours: 24,

  buildPrompt: (ctx) => {
    const system = `You are an Engineering Intelligence analyzer producing a weekly engineering report.

Rules:
- Summarize the week's themes (what was the focus?).
- List what was shipped (merged PRs, releases).
- Identify risks observed during the week.
- Suggest focus areas for next week based on patterns.
- Base everything on the provided evidence only.`;

    const eventBlock = buildEventContextBlock(ctx.events, 60);
    const rollup = buildClassificationRollup(ctx.events);
    const memory = formatPreviousSummary(ctx.previousSummary);

    const user = `Repository: ${ctx.repoOwner}/${ctx.repoName}
Week: ${ctx.dateFrom} to ${ctx.dateTo}
Work distribution: ${rollup}

Activity:
${eventBlock}
${memory ? `\nPrevious week summary:\n${memory}` : ''}

Produce a weekly report as JSON matching this schema:
{ "overview": string, "themes": string[], "shipped": string[], "risks": string[], "next_week": string[] }`;

    return { system, user };
  },

  fallback: weeklyReportFallback,
};

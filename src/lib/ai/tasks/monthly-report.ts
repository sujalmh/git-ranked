import { MonthlyReportSchema } from '../schemas';
import { buildClassificationRollup, buildEventContextBlock } from '../context';
import { formatPreviousSummary } from '../memory';
import { monthlyReportFallback } from '../fallback';
import type { AiTask, MonthlyReport } from '../types';

export const monthlyReportTask: AiTask<MonthlyReport> = {
  id: 'monthly_report',
  storage: 'ai_summaries',
  schema: MonthlyReportSchema,
  schemaVersion: '1.0.0',
  promptVersion: '1.0.0',
  cacheTtlHours: 72,

  buildPrompt: (ctx) => {
    const system = `You are an Engineering Intelligence analyzer producing a monthly engineering report.

Rules:
- Identify the month's overarching themes.
- Summarize what was shipped across the month.
- Highlight risks or patterns observed over the longer period.
- Suggest strategic focus areas for next month.
- Base everything on the provided evidence only.`;

    const eventBlock = buildEventContextBlock(ctx.events, 80);
    const rollup = buildClassificationRollup(ctx.events);
    const memory = formatPreviousSummary(ctx.previousSummary);

    const user = `Repository: ${ctx.repoOwner}/${ctx.repoName}
Month: ${ctx.dateFrom} to ${ctx.dateTo}
Work distribution: ${rollup}

Activity:
${eventBlock}
${memory ? `\nPrevious weekly summaries:\n${memory}` : ''}

Produce a monthly report as JSON matching this schema:
{ "overview": string, "themes": string[], "shipped": string[], "risks": string[], "next_month": string[] }`;

    return { system, user };
  },

  fallback: monthlyReportFallback,
};

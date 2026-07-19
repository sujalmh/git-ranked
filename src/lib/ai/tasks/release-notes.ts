import { ReleaseNotesSchema } from '../schemas';
import { buildEventContextBlock } from '../context';
import { releaseNotesFallback } from '../fallback';
import type { AiTask, ReleaseNotes } from '../types';

export const releaseNotesTask: AiTask<ReleaseNotes> = {
  id: 'release_notes',
  storage: 'ai_summaries',
  schema: ReleaseNotesSchema,
  schemaVersion: '1.0.0',
  promptVersion: '1.0.0',
  cacheTtlHours: 24,

  buildPrompt: (ctx) => {
    const system = `You are writing user-facing release notes from engineering activity.

Rules:
- Extract features, fixes, improvements, and breaking changes from the events.
- Write each item as a concise bullet point (user-facing language, not commit messages).
- Only include items with clear evidence in the events.
- If no breaking changes are observed, return an empty array.
- Do NOT invent changes that are not supported by the activity.`;

    const eventBlock = buildEventContextBlock(ctx.events, 60);

    const user = `Repository: ${ctx.repoOwner}/${ctx.repoName}
Period: ${ctx.dateFrom} to ${ctx.dateTo}

Activity:
${eventBlock}

Produce release notes as JSON matching this schema:
{ "summary": string, "features": string[], "fixes": string[], "improvements": string[], "breaking_changes": string[], "other": string[] }`;

    return { system, user };
  },

  fallback: releaseNotesFallback,
};

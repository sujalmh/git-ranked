import { sql } from '../db';
import type { TaskStorage } from './types';

export async function getPreviousSummary(
  taskId: string,
  storage: TaskStorage,
  repoId: number,
  dateTo: string,
  contributorId?: number
): Promise<unknown | null> {
  if (storage === 'ai_summaries') {
    const rows = contributorId
      ? await sql`
          SELECT payload FROM ai_summaries
          WHERE repo_id = ${repoId}
            AND contributor_id = ${contributorId}
            AND summary_type = ${taskId}
            AND date_to < ${dateTo}::date
            AND payload IS NOT NULL
          ORDER BY date_to DESC LIMIT 1
        `
      : await sql`
          SELECT payload FROM ai_summaries
          WHERE repo_id = ${repoId}
            AND contributor_id IS NULL
            AND summary_type = ${taskId}
            AND date_to < ${dateTo}::date
            AND payload IS NOT NULL
          ORDER BY date_to DESC LIMIT 1
        `;
    return rows.length > 0 ? rows[0].payload : null;
  }

  if (storage === 'insight_caches') {
    const rows = contributorId
      ? await sql`
          SELECT payload FROM insight_caches
          WHERE repo_id = ${repoId}
            AND contributor_id = ${contributorId}
            AND insight_type = ${taskId}
            AND payload IS NOT NULL
          ORDER BY generated_at DESC LIMIT 1
        `
      : await sql`
          SELECT payload FROM insight_caches
          WHERE repo_id = ${repoId}
            AND contributor_id IS NULL
            AND insight_type = ${taskId}
            AND payload IS NOT NULL
          ORDER BY generated_at DESC LIMIT 1
        `;
    return rows.length > 0 ? rows[0].payload : null;
  }

  return null;
}

export function formatPreviousSummary(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const obj = payload as Record<string, unknown>;
  const fields: string[] = [];

  for (const key of ['overview', 'summary', 'themes']) {
    const val = obj[key];
    if (typeof val === 'string' && val) {
      fields.push(`Previous ${key}: ${val}`);
    }
  }
  for (const key of ['shipped', 'completed_features', 'highlights', 'accomplishments']) {
    const val = obj[key];
    if (Array.isArray(val) && val.length) {
      fields.push(`Previous ${key}: ${val.slice(0, 5).join('; ')}`);
    }
  }
  for (const key of ['risks', 'concerns']) {
    const val = obj[key];
    if (Array.isArray(val) && val.length) {
      fields.push(`Previous ${key}: ${val.slice(0, 3).join('; ')}`);
    }
  }

  return fields.length ? fields.join('\n') : '';
}

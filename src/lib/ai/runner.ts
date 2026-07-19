import { z } from 'zod';
import { sql } from '../db';
import { AI_MODEL, callStructured, hasApiKey } from './openrouter';
import { getPreviousSummary } from './memory';
import type { AiResult, AiTask, TaskContext } from './types';

const STRICT_FORMATTING_NOTE =
  'CRITICAL: Respond with ONLY valid JSON matching the schema. No markdown, no code fences, no commentary — just the JSON object.';

export async function getCachedResult<T>(
  task: AiTask<T>,
  repoId: number,
  dateFrom: string,
  dateTo: string,
  contributorId?: number
): Promise<AiResult<T> | null> {
  if (task.storage === 'ai_summaries') {
    const rows = contributorId
      ? await sql`
          SELECT payload, confidence, source, model_used, generated_at
          FROM ai_summaries
          WHERE repo_id = ${repoId}
            AND contributor_id = ${contributorId}
            AND summary_type = ${task.id}
            AND date_from = ${dateFrom}
            AND date_to = ${dateTo}
            AND schema_version = ${task.schemaVersion}
            AND prompt_version = ${task.promptVersion}
            AND payload IS NOT NULL
            AND generated_at > NOW() - INTERVAL '${sql.unsafe(`${task.cacheTtlHours} hours`)}'
          ORDER BY generated_at DESC LIMIT 1
        `
      : await sql`
          SELECT payload, confidence, source, model_used, generated_at
          FROM ai_summaries
          WHERE repo_id = ${repoId}
            AND contributor_id IS NULL
            AND summary_type = ${task.id}
            AND date_from = ${dateFrom}
            AND date_to = ${dateTo}
            AND schema_version = ${task.schemaVersion}
            AND prompt_version = ${task.promptVersion}
            AND payload IS NOT NULL
            AND generated_at > NOW() - INTERVAL '${sql.unsafe(`${task.cacheTtlHours} hours`)}'
          ORDER BY generated_at DESC LIMIT 1
        `;

    if (rows.length === 0) return null;
    return rowToResult<T>(rows[0]);
  }

  const cacheRows = contributorId
    ? await sql`
        SELECT payload, confidence, source, generated_at
        FROM insight_caches
        WHERE repo_id = ${repoId}
          AND contributor_id = ${contributorId}
          AND insight_type = ${task.id}
          AND schema_version = ${task.schemaVersion}
          AND prompt_version = ${task.promptVersion}
          AND payload IS NOT NULL
          AND generated_at > NOW() - INTERVAL '${sql.unsafe(`${task.cacheTtlHours} hours`)}'
        ORDER BY generated_at DESC LIMIT 1
      `
    : await sql`
        SELECT payload, confidence, source, generated_at
        FROM insight_caches
        WHERE repo_id = ${repoId}
          AND contributor_id IS NULL
          AND insight_type = ${task.id}
          AND schema_version = ${task.schemaVersion}
          AND prompt_version = ${task.promptVersion}
          AND payload IS NOT NULL
          AND generated_at > NOW() - INTERVAL '${sql.unsafe(`${task.cacheTtlHours} hours`)}'
        ORDER BY generated_at DESC LIMIT 1
      `;

  if (cacheRows.length === 0) return null;
  const row = cacheRows[0];
  return {
    payload: row.payload as T,
    confidence: typeof row.confidence === 'number' ? row.confidence : 0.5,
    source: (row.source as 'ai' | 'fallback') ?? 'ai',
    modelUsed: AI_MODEL,
    generatedAt: new Date(row.generated_at as string),
  };
}

function rowToResult<T>(row: Record<string, unknown>): AiResult<T> {
  return {
    payload: row.payload as T,
    confidence: typeof row.confidence === 'number' ? row.confidence : 0.5,
    source: (row.source as 'ai' | 'fallback') ?? 'ai',
    modelUsed: (row.model_used as string) ?? AI_MODEL,
    generatedAt: new Date(row.generated_at as string),
  };
}

async function persistResult<T>(
  task: AiTask<T>,
  repoId: number,
  dateFrom: string,
  dateTo: string,
  contributorId: number | undefined,
  result: AiResult<T>
): Promise<void> {
  const payloadJson = JSON.stringify(result.payload);

  if (task.storage === 'ai_summaries') {
    if (contributorId) {
      await sql`
        INSERT INTO ai_summaries (repo_id, contributor_id, summary_type, date_from, date_to, summary_text, payload, schema_version, prompt_version, confidence, source, model_used)
        VALUES (${repoId}, ${contributorId}, ${task.id}, ${dateFrom}, ${dateTo}, ${payloadJson}, ${payloadJson}, ${task.schemaVersion}, ${task.promptVersion}, ${result.confidence}, ${result.source}, ${result.modelUsed})
      `;
    } else {
      await sql`
        INSERT INTO ai_summaries (repo_id, summary_type, date_from, date_to, summary_text, payload, schema_version, prompt_version, confidence, source, model_used)
        VALUES (${repoId}, ${task.id}, ${dateFrom}, ${dateTo}, ${payloadJson}, ${payloadJson}, ${task.schemaVersion}, ${task.promptVersion}, ${result.confidence}, ${result.source}, ${result.modelUsed})
      `;
    }
    return;
  }

  if (contributorId) {
    await persistInsightCache(repoId, contributorId, task, payloadJson, result);
  } else {
    await persistInsightCache(repoId, null, task, payloadJson, result);
  }
}

async function persistInsightCache(
  repoId: number,
  contributorId: number | null,
  task: AiTask<unknown>,
  payloadJson: string,
  result: AiResult<unknown>
): Promise<void> {
  try {
    await sql`
      INSERT INTO insight_caches (repo_id, contributor_id, insight_type, payload, schema_version, prompt_version, confidence, source)
      VALUES (${repoId}, ${contributorId}, ${task.id}, ${payloadJson}, ${task.schemaVersion}, ${task.promptVersion}, ${result.confidence}, ${result.source})
      ON CONFLICT (repo_id, contributor_id, insight_type) DO UPDATE
      SET payload = ${payloadJson},
          schema_version = ${task.schemaVersion},
          prompt_version = ${task.promptVersion},
          confidence = ${result.confidence},
          source = ${result.source},
          generated_at = CURRENT_TIMESTAMP
    `;
  } catch (upsertErr) {
    console.warn('ON CONFLICT upsert failed, falling back to DELETE + INSERT:', upsertErr instanceof Error ? upsertErr.message : upsertErr);
    await sql`
      DELETE FROM insight_caches
      WHERE repo_id = ${repoId}
        AND contributor_id IS NOT DISTINCT FROM ${contributorId}
        AND insight_type = ${task.id}
    `;
    await sql`
      INSERT INTO insight_caches (repo_id, contributor_id, insight_type, payload, schema_version, prompt_version, confidence, source)
      VALUES (${repoId}, ${contributorId}, ${task.id}, ${payloadJson}, ${task.schemaVersion}, ${task.promptVersion}, ${result.confidence}, ${result.source})
    `;
  }
}

function parseJsonContent(content: string): unknown {
  let cleaned = content.trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  }

  return JSON.parse(cleaned);
}

export async function runTask<T>(
  task: AiTask<T>,
  ctx: TaskContext,
  options: { generateIfMissing?: boolean } = {}
): Promise<AiResult<T> | null> {
  const { generateIfMissing = false } = options;

  const cached = await getCachedResult(task, ctx.repoId, ctx.dateFrom, ctx.dateTo, ctx.contributorId);
  if (cached) return cached;

  if (!generateIfMissing) return null;

  const previousSummary = await getPreviousSummary(
    task.id,
    task.storage,
    ctx.repoId,
    ctx.dateFrom,
    ctx.contributorId
  );
  const ctxWithMemory: TaskContext = { ...ctx, previousSummary };

  const { system, user } = task.buildPrompt(ctxWithMemory);
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];

  let result: AiResult<T> | null = null;

  if (hasApiKey()) {
    const jsonSchema = z.toJSONSchema(task.schema) as Record<string, unknown>;
    result = await attemptStructuredCall(task, messages, jsonSchema);
  }

  if (!result && task.fallback) {
    console.warn(`AI task "${task.id}" falling back to deterministic logic.`);
    const fallbackPayload = task.fallback(ctxWithMemory);
    result = {
      payload: fallbackPayload,
      confidence: 0.4,
      source: 'fallback',
      modelUsed: 'deterministic-fallback',
      generatedAt: new Date(),
    };
  }

  if (!result) return null;

  await persistResult(task, ctx.repoId, ctx.dateFrom, ctx.dateTo, ctx.contributorId, result);

  return result;
}

async function attemptStructuredCall<T>(
  task: AiTask<T>,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  jsonSchema: Record<string, unknown>
): Promise<AiResult<T> | null> {
  const attempts: Array<{ messages: typeof messages; label: string }> = [
    { messages, label: 'initial' },
    {
      messages: [
        ...messages,
        { role: 'system', content: STRICT_FORMATTING_NOTE },
      ],
      label: 'strict-retry',
    },
  ];

  for (const attempt of attempts) {
    try {
      const content = await callStructured(attempt.messages, jsonSchema, task.id);
      if (!content) continue;

      const parsed = parseJsonContent(content);
      const validated = task.schema.safeParse(parsed);
      if (validated.success) {
        const confidence = extractConfidence(validated.data);
        return {
          payload: validated.data,
          confidence,
          source: 'ai',
          modelUsed: AI_MODEL,
          generatedAt: new Date(),
        };
      }

      console.warn(`AI task "${task.id}" (${attempt.label}) schema validation failed:`, validated.error.issues.slice(0, 3));
    } catch (error) {
      console.warn(`AI task "${task.id}" (${attempt.label}) call failed:`, error instanceof Error ? error.message : error);
    }
  }

  return null;
}

function extractConfidence<T>(payload: T): number {
  if (payload && typeof payload === 'object' && 'confidence' in payload) {
    const val = (payload as { confidence: unknown }).confidence;
    if (typeof val === 'number' && val >= 0 && val <= 1) return val;
  }
  return 0.7;
}

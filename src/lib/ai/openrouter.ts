import { sql } from '../db';
import { emitTelemetry, type ApiTelemetryEvent } from './telemetry';
export { DEFAULT_AI_MODEL, RECOMMENDED_AI_MODELS } from './models';
export { emitTelemetry, setTelemetryListener, type ApiTelemetryEvent, type TelemetryListener } from './telemetry';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const APP_REFERER = process.env.OPENROUTER_REFERER || 'https://gitranked.dev';
const APP_TITLE = process.env.OPENROUTER_TITLE || 'GitRanked';

let cachedModel: { model: string; fetchedAt: number } | null = null;

export async function getAiModel(): Promise<string> {
  const now = Date.now();
  if (cachedModel && now - cachedModel.fetchedAt < 2_000) {
    return cachedModel.model;
  }
  try {
    const rows = await sql`SELECT value FROM system_settings WHERE key = 'ai_model'`;
    if (rows.length > 0 && rows[0].value !== undefined && rows[0].value !== null) {
      let raw: unknown = rows[0].value;
      if (typeof raw === 'object' && raw !== null) {
        raw = JSON.stringify(raw);
      }
      if (typeof raw === 'string') {
        let clean = raw.trim();
        if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
          try {
            clean = JSON.parse(clean);
          } catch {
            clean = clean.slice(1, -1);
          }
        }
        if (clean && typeof clean === 'string' && clean.trim()) {
          const finalModel = clean.trim();
          cachedModel = { model: finalModel, fetchedAt: now };
          return finalModel;
        }
      }
    }
  } catch {
    // fallback if table does not exist yet
  }
  const fallback = process.env.OPENROUTER_MODEL || 'tencent/hy3:free';
  cachedModel = { model: fallback, fetchedAt: now };
  return fallback;
}

export async function setAiModel(model: string): Promise<string> {
  const cleanModel = model.trim();
  if (!cleanModel) {
    throw new Error('Model name cannot be empty');
  }
  await sql`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ('ai_model', ${JSON.stringify(cleanModel)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = NOW()
  `;
  cachedModel = { model: cleanModel, fetchedAt: Date.now() };
  return cleanModel;
}

// Backward compatibility export
export const AI_MODEL = process.env.OPENROUTER_MODEL || 'tencent/hy3:free';

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    code?: number;
  };
};

export type StructuredOutputMode = 'json_schema' | 'json_object' | 'none';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type CompletionRequest = {
  messages: ChatMessage[];
  responseFormat?:
    | { type: 'json_schema'; json_schema: { name: string; strict: boolean; schema: Record<string, unknown> } }
    | { type: 'json_object' }
    | { type: 'none' };
  temperature?: number;
};

export type UserAiConfig = {
  apiKey: string;
  model: string;
  isCustom: boolean;
};

export type AiCallOptions = {
  apiKey?: string;
  model?: string;
};

export async function getUserAiConfig(userId?: number | null): Promise<UserAiConfig> {
  const defaultModel = await getAiModel();
  const defaultApiKey = process.env.OPENROUTER_API_KEY || '';

  if (!userId) {
    return {
      apiKey: defaultApiKey,
      model: defaultModel,
      isCustom: false,
    };
  }

  try {
    const rows = await sql`
      SELECT openrouter_api_key, ai_model, use_custom_key
      FROM app_users
      WHERE id = ${userId}
    `;

    if (rows.length > 0) {
      const user = rows[0];
      const useCustom = Boolean(user.use_custom_key);
      const userKey = typeof user.openrouter_api_key === 'string' ? user.openrouter_api_key.trim() : '';
      const userModel = typeof user.ai_model === 'string' ? user.ai_model.trim() : '';

      if (useCustom && userKey) {
        return {
          apiKey: userKey,
          model: userModel || defaultModel,
          isCustom: true,
        };
      }
    }
  } catch (err) {
    console.error('Failed to fetch user AI config, using default:', err);
  }

  return {
    apiKey: defaultApiKey,
    model: defaultModel,
    isCustom: false,
  };
}

function resolveApiKey(options?: AiCallOptions): string {
  if (options?.apiKey && options.apiKey.trim()) {
    return options.apiKey.trim();
  }
  return process.env.OPENROUTER_API_KEY || '';
}

export function hasApiKey(options?: AiCallOptions): boolean {
  return Boolean(resolveApiKey(options));
}

async function callOpenRouter(
  request: CompletionRequest,
  taskName = 'inference',
  options?: AiCallOptions
): Promise<string | null> {
  const apiKey = resolveApiKey(options);
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const activeModel = options?.model?.trim() || (await getAiModel());
  const startTime = Date.now();

  emitTelemetry({
    type: 'api_request',
    provider: 'openrouter',
    endpoint: 'POST /v1/chat/completions',
    model: activeModel,
    task: taskName,
    summary: `[API_REQ] POST /v1/chat/completions (${activeModel} · ${taskName})`,
  });

  const body: Record<string, unknown> = {
    model: activeModel,
    messages: request.messages,
  };

  if (request.responseFormat && request.responseFormat.type !== 'none') {
    body.response_format = request.responseFormat;
  }
  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }

  let response: Response;
  let attemptCount = 0;

  while (true) {
    attemptCount++;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': APP_REFERER,
          'X-Title': APP_TITLE,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      });

      if ((response.status === 429 || response.status === 503) && attemptCount < 2) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000;
        console.warn(`[OpenRouter] Received HTTP ${response.status}. Retrying after ${waitMs}ms...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      break;
    } catch (netErr) {
      if (attemptCount < 2 && netErr instanceof Error && netErr.name === 'TimeoutError') {
        console.warn(`[OpenRouter] Request timed out. Retrying once...`);
        continue;
      }
      const latencyMs = Date.now() - startTime;
      const errStr = netErr instanceof Error ? netErr.message : String(netErr);
      emitTelemetry({
        type: 'api_error',
        provider: 'openrouter',
        endpoint: 'POST /v1/chat/completions',
        model: activeModel,
        task: taskName,
        latencyMs,
        summary: `[API_ERR] OpenRouter request failed (${latencyMs}ms): ${errStr}`,
      });
      throw netErr;
    }
  }

  const latencyMs = Date.now() - startTime;

  if (!response.ok) {
    const errText = await response.text();
    emitTelemetry({
      type: 'api_error',
      provider: 'openrouter',
      endpoint: 'POST /v1/chat/completions',
      model: activeModel,
      task: taskName,
      status: response.status,
      latencyMs,
      summary: `[API_ERR] OpenRouter HTTP ${response.status} ${response.statusText} (${latencyMs}ms)`,
    });
    throw new OpenRouterError(response.status, errText);
  }

  const data = (await response.json()) as OpenRouterResponse;
  if (data.error) {
    emitTelemetry({
      type: 'api_error',
      provider: 'openrouter',
      endpoint: 'POST /v1/chat/completions',
      model: activeModel,
      task: taskName,
      status: data.error.code ?? 500,
      latencyMs,
      summary: `[API_ERR] OpenRouter API error ${data.error.code ?? 500}: ${data.error.message ?? 'Unknown'}`,
    });
    throw new OpenRouterError(data.error.code ?? 500, data.error.message ?? 'Unknown OpenRouter error');
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenRouter returned an empty response');
  }

  emitTelemetry({
    type: 'api_response',
    provider: 'openrouter',
    endpoint: 'POST /v1/chat/completions',
    model: activeModel,
    task: taskName,
    status: 200,
    latencyMs,
    summary: `[API_RES] 200 OK (${latencyMs}ms) — received response (${content.length} chars)`,
  });

  return content;
}

export class OpenRouterError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`OpenRouter API error (${status}): ${body}`);
    this.name = 'OpenRouterError';
    this.status = status;
    this.body = body;
  }
}

export function isStructuredModeUnsupported(error: unknown): boolean {
  if (error instanceof OpenRouterError) {
    const body = error.body.toLowerCase();
    return (
      error.status === 400 &&
      (body.includes('response_format') ||
        body.includes('json_schema') ||
        body.includes('structured') ||
        body.includes('schema'))
    );
  }
  return false;
}

export async function callStructured(
  messages: ChatMessage[],
  jsonSchema: Record<string, unknown>,
  schemaName: string,
  options?: AiCallOptions
): Promise<string | null> {
  const modes: StructuredOutputMode[] = ['json_schema', 'json_object', 'none'];

  for (const mode of modes) {
    const responseFormat: CompletionRequest['responseFormat'] =
      mode === 'json_schema'
        ? { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema: jsonSchema } }
        : mode === 'json_object'
          ? { type: 'json_object' }
          : { type: 'none' };

    try {
      const content = await callOpenRouter({ messages, responseFormat, temperature: 0.2 }, schemaName, options);
      if (content) return content;
    } catch (error) {
      if (mode === 'json_schema' && isStructuredModeUnsupported(error) && modes.indexOf(mode) < modes.length - 1) {
        continue;
      }
      throw error;
    }
  }

  return null;
}

export async function callUnstructured(
  messages: ChatMessage[],
  taskName = 'unstructured',
  options?: AiCallOptions
): Promise<string | null> {
  return callOpenRouter({ messages, responseFormat: { type: 'none' }, temperature: 0.3 }, taskName, options);
}

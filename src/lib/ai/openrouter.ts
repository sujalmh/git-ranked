import { AsyncLocalStorage } from 'async_hooks';
import { sql } from '../db';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const APP_REFERER = process.env.OPENROUTER_REFERER || 'https://gitranked.dev';
const APP_TITLE = process.env.OPENROUTER_TITLE || 'GitRanked';

export const DEFAULT_AI_MODEL = process.env.OPENROUTER_MODEL || 'tencent/hy3:free';

export const RECOMMENDED_AI_MODELS = [
  { id: 'tencent/hy3:free', name: 'Tencent Hunyuan 3 (Free)', provider: 'Tencent', badge: 'Default' },
  { id: 'google/gemini-2.0-flash-lite-preview-02-05:free', name: 'Gemini 2.0 Flash Lite (Free)', provider: 'Google', badge: 'Fast' },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', provider: 'DeepSeek', badge: 'Reasoning' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', provider: 'Meta', badge: 'Powerful' },
  { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B (Free)', provider: 'Qwen', badge: 'Code' },
  { id: 'mistralai/mistral-small-24b-instruct-2501:free', name: 'Mistral Small 24B (Free)', provider: 'Mistral', badge: 'Balanced' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', badge: 'Flagship' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', badge: 'Popular' },
] as const;

export type ApiTelemetryEvent = {
  type: 'api_request' | 'api_response' | 'api_error';
  provider: 'openrouter' | 'github';
  endpoint: string;
  model?: string;
  task?: string;
  status?: number;
  latencyMs?: number;
  summary: string;
};

export type TelemetryListener = (event: ApiTelemetryEvent) => void;

export const telemetryStorage = new AsyncLocalStorage<TelemetryListener>();

export function emitTelemetry(event: ApiTelemetryEvent) {
  const listener = telemetryStorage.getStore();
  if (listener) {
    try {
      listener(event);
    } catch {
      // ignore
    }
  }
}

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
export const AI_MODEL = DEFAULT_AI_MODEL;

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

function isApiKeyConfigured() {
  return Boolean(OPENROUTER_API_KEY);
}

async function callOpenRouter(request: CompletionRequest, taskName = 'inference'): Promise<string | null> {
  if (!isApiKeyConfigured()) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const activeModel = await getAiModel();
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
  try {
    response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': APP_REFERER,
        'X-Title': APP_TITLE,
      },
      body: JSON.stringify(body),
    });
  } catch (netErr) {
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
  schemaName: string
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
      const content = await callOpenRouter({ messages, responseFormat, temperature: 0.2 }, schemaName);
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

export async function callUnstructured(messages: ChatMessage[], taskName = 'unstructured'): Promise<string | null> {
  return callOpenRouter({ messages, responseFormat: { type: 'none' }, temperature: 0.3 }, taskName);
}

export function hasApiKey() {
  return isApiKeyConfigured();
}

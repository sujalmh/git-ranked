import { generateObject, generateText, jsonSchema as toJsonSchema, zodSchema, type LanguageModel, type ModelMessage } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import { sql } from '../db';
import { emitTelemetry } from './telemetry';
import {
  DEFAULT_AI_PROVIDER,
  normalizeEndpoint,
  type AiProvider,
} from './models';
export { DEFAULT_AI_MODEL, RECOMMENDED_AI_MODELS } from './models';
export {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  getProviderConfig,
  normalizeEndpoint,
  type AiProvider,
  type ProviderConfig,
} from './models';
export { emitTelemetry, setTelemetryListener, type ApiTelemetryEvent, type TelemetryListener } from './telemetry';

const DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const APP_REFERER = process.env.OPENROUTER_REFERER || 'https://gitranked.dev';
const APP_TITLE = process.env.OPENROUTER_TITLE || 'GitRanked';

// Generous timeout: batch extraction and repo-wide summaries send large prompts
// to models that can be slow (free-tier 120b models especially).
const AI_TIMEOUT_MS = 120_000;

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
  const fallback = process.env.AI_MODEL || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';
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
export const AI_MODEL = process.env.AI_MODEL || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';

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
  /** Full chat-completions endpoint URL. */
  baseUrl: string;
  provider: AiProvider;
  isCustom: boolean;
};

export type AiCallOptions = {
  apiKey?: string;
  model?: string;
  /** Full chat-completions endpoint URL. Overrides the provider preset. */
  baseUrl?: string;
  provider?: AiProvider;
};

export async function getUserAiConfig(userId?: number | null): Promise<UserAiConfig> {
  const defaultModel = await getAiModel();
  const defaultApiKey = process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || '';
  const defaultProvider: AiProvider = (process.env.AI_PROVIDER as AiProvider) || DEFAULT_AI_PROVIDER;
  const defaultBaseUrl = normalizeEndpoint(process.env.AI_ENDPOINT || '', defaultProvider);

  if (!userId) {
    return {
      apiKey: defaultApiKey,
      model: defaultModel,
      baseUrl: defaultBaseUrl || DEFAULT_ENDPOINT,
      provider: defaultProvider,
      isCustom: false,
    };
  }

  try {
    const rows = await sql`
      SELECT openrouter_api_key, ai_model, use_custom_key, ai_endpoint, ai_provider
      FROM app_users
      WHERE id = ${userId}
    `;

    if (rows.length > 0) {
      const user = rows[0];
      const useCustom = Boolean(user.use_custom_key);
      const userKey = typeof user.openrouter_api_key === 'string' ? user.openrouter_api_key.trim() : '';
      const userModel = typeof user.ai_model === 'string' ? user.ai_model.trim() : '';

      if (useCustom && userKey) {
        const provider: AiProvider =
          (user.ai_provider as AiProvider) || defaultProvider;
        const storedEndpoint =
          typeof user.ai_endpoint === 'string' ? user.ai_endpoint.trim() : '';
        const baseUrl = normalizeEndpoint(storedEndpoint, provider) || defaultBaseUrl || DEFAULT_ENDPOINT;

        return {
          apiKey: userKey,
          model: userModel || defaultModel,
          baseUrl,
          provider,
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
    baseUrl: defaultBaseUrl || DEFAULT_ENDPOINT,
    provider: defaultProvider,
    isCustom: false,
  };
}

function resolveApiKey(options?: AiCallOptions): string {
  if (options?.apiKey && options.apiKey.trim()) {
    return options.apiKey.trim();
  }
  return process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || '';
}

function resolveEndpoint(options?: AiCallOptions): { url: string; provider: AiProvider } {
  const provider: AiProvider = options?.provider || DEFAULT_AI_PROVIDER;
  const url = normalizeEndpoint(options?.baseUrl || '', provider) || DEFAULT_ENDPOINT;
  return { url, provider };
}

/**
 * The AI SDK expects a base URL without the /chat/completions suffix (it appends
 * it), whereas the rest of the app stores full chat-completions URLs.
 */
function toBaseUrl(endpointUrl: string): string {
  return endpointUrl.replace(/\/chat\/completions$/, '').replace(/\/+$/, '') || endpointUrl;
}

function buildModel(
  endpointUrl: string,
  apiKey: string,
  provider: AiProvider,
  modelId: string
): LanguageModel {
  const headers: Record<string, string> = {};
  // OpenRouter uses extra attribution headers; other providers don't accept them.
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = APP_REFERER;
    headers['X-Title'] = APP_TITLE;
  }
  const compatible = createOpenAICompatible({
    name: provider,
    baseURL: toBaseUrl(endpointUrl),
    apiKey,
    headers,
  });
  return compatible.languageModel(modelId);
}

function isZodSchema(value: unknown): value is z.ZodType {
  return value instanceof z.ZodType || (!!value && typeof value === 'object' && '_zod' in (value as Record<string, unknown>));
}

export function hasApiKey(options?: AiCallOptions): boolean {
  return Boolean(resolveApiKey(options));
}

export class OpenRouterError extends Error {
  status: number;
  body: string;
  provider: string;
  constructor(status: number, body: string, provider = 'openrouter') {
    super(`${provider} API error (${status}): ${body}`);
    this.name = 'OpenRouterError';
    this.status = status;
    this.body = body;
    this.provider = provider;
  }
}

export function isStructuredModeUnsupported(error: unknown): boolean {
  const err = unwrapRetryError(error) as { status?: number; statusCode?: number } | null;
  const status = err?.status ?? err?.statusCode;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    status === 400 &&
    (msg.includes('response_format') ||
      msg.includes('json_schema') ||
      msg.includes('structured') ||
      msg.includes('schema'))
  );
}

/**
 * The AI SDK wraps exhausted retries in a RetryError; unwrap to the underlying
 * API error so status/body are accessible to callers and fallback logic.
 */
function unwrapRetryError(err: unknown): unknown {
  const e = err as { errors?: unknown[]; lastError?: unknown } | null;
  if (e && Array.isArray(e.errors) && e.errors.length > 0) {
    return e.errors[e.errors.length - 1];
  }
  if (e && e.lastError !== undefined) return e.lastError;
  return err;
}

/** Normalize an AI-SDK error into the app's error shape while keeping status. */
function toAiError(err: unknown, provider: string): Error {
  if (err instanceof OpenRouterError) return err;
  const unwrapped = unwrapRetryError(err) as { statusCode?: number; responseBody?: string } | null;
  if (typeof unwrapped?.statusCode === 'number') {
    const body = unwrapped.responseBody ?? (unwrapped instanceof Error ? unwrapped.message : String(unwrapped));
    return new OpenRouterError(unwrapped.statusCode, body, provider);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** Whether a generateObject failure should fall back to plain text generation. */
function shouldFallbackToText(err: unknown): boolean {
  if (isStructuredModeUnsupported(err)) return true;
  const unwrapped = unwrapRetryError(err);
  const name = (unwrapped as { name?: string } | null)?.name ?? (err as { name?: string } | null)?.name ?? '';
  return name === 'TypeValidationError' || name === 'NoObjectGeneratedError' || name.includes('Validation');
}

async function callChatCompletions(
  request: CompletionRequest,
  taskName = 'inference',
  options?: AiCallOptions
): Promise<string | null> {
  const apiKey = resolveApiKey(options);
  if (!apiKey) {
    throw new Error('AI_API_KEY / OPENROUTER_API_KEY is not configured');
  }

  const { url: endpointUrl, provider } = resolveEndpoint(options);
  const activeModel = options?.model?.trim() || (await getAiModel());
  const startTime = Date.now();

  emitTelemetry({
    type: 'api_request',
    provider,
    endpoint: `POST ${endpointUrl}`,
    model: activeModel,
    task: taskName,
    summary: `[API_REQ] POST ${endpointUrl} (${activeModel} · ${taskName})`,
  });

  try {
    const model = buildModel(endpointUrl, apiKey, provider, activeModel);
    const { text } = await generateText({
      model,
      messages: request.messages as unknown as ModelMessage[],
      temperature: request.temperature,
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
      allowSystemInMessages: true,
      maxRetries: 2,
    });

    const content = text?.trim();
    if (!content) {
      throw new Error(`${provider} returned an empty response`);
    }

    emitTelemetry({
      type: 'api_response',
      provider,
      endpoint: `POST ${endpointUrl}`,
      model: activeModel,
      task: taskName,
      status: 200,
      latencyMs: Date.now() - startTime,
      summary: `[API_RES] 200 OK (${Date.now() - startTime}ms) — received response (${content.length} chars)`,
    });

    return content;
  } catch (err) {
    emitTelemetry({
      type: 'api_error',
      provider,
      endpoint: `POST ${endpointUrl}`,
      model: activeModel,
      task: taskName,
      status: (err as { statusCode?: number } | null)?.statusCode,
      latencyMs: Date.now() - startTime,
      summary: `[API_ERR] ${provider} request failed (${Date.now() - startTime}ms): ${err instanceof Error ? err.message : String(err)}`,
    });
    throw toAiError(err, provider);
  }
}

export async function callStructured(
  messages: ChatMessage[],
  jsonSchema: Record<string, unknown> | z.ZodType,
  schemaName: string,
  options?: AiCallOptions
): Promise<string | null> {
  const apiKey = resolveApiKey(options);
  if (!apiKey) return null;

  const { url: endpointUrl, provider } = resolveEndpoint(options);
  const activeModel = options?.model?.trim() || (await getAiModel());
  const startTime = Date.now();

  emitTelemetry({
    type: 'api_request',
    provider,
    endpoint: `POST ${endpointUrl}`,
    model: activeModel,
    task: schemaName,
    summary: `[API_REQ] POST ${endpointUrl} (${activeModel} · ${schemaName} · structured)`,
  });

  const model = buildModel(endpointUrl, apiKey, provider, activeModel);
  const schema = isZodSchema(jsonSchema) ? zodSchema(jsonSchema) : toJsonSchema(jsonSchema);

  try {
    const result = await generateObject({
      model,
      schema,
      schemaName,
      messages: messages as unknown as ModelMessage[],
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
      allowSystemInMessages: true,
      maxRetries: 2,
    });

    emitTelemetry({
      type: 'api_response',
      provider,
      endpoint: `POST ${endpointUrl}`,
      model: activeModel,
      task: schemaName,
      status: 200,
      latencyMs: Date.now() - startTime,
      summary: `[API_RES] 200 OK (${Date.now() - startTime}ms) — structured response`,
    });

    return JSON.stringify(result.object);
  } catch (err) {
    // Fall back to plain-text generation (the caller re-parses + validates),
    // which covers providers/models without structured-output support — this
    // mirrors the old json_object / none response-format fallback chain.
    if (shouldFallbackToText(err)) {
      try {
        const { text } = await generateText({
          model,
          messages: messages as unknown as ModelMessage[],
          temperature: 0.2,
          abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
          allowSystemInMessages: true,
          maxRetries: 2,
        });
        const content = text?.trim();
        if (content) {
          emitTelemetry({
            type: 'api_response',
            provider,
            endpoint: `POST ${endpointUrl}`,
            model: activeModel,
            task: schemaName,
            status: 200,
            latencyMs: Date.now() - startTime,
            summary: `[API_RES] 200 OK (${Date.now() - startTime}ms) — text fallback`,
          });
          return content;
        }
      } catch (fallbackErr) {
        emitTelemetry({
          type: 'api_error',
          provider,
          endpoint: `POST ${endpointUrl}`,
          model: activeModel,
          task: schemaName,
          status: (fallbackErr as { statusCode?: number } | null)?.statusCode,
          latencyMs: Date.now() - startTime,
          summary: `[API_ERR] ${provider} text fallback failed (${Date.now() - startTime}ms): ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
        });
        throw toAiError(fallbackErr, provider);
      }
    }

    emitTelemetry({
      type: 'api_error',
      provider,
      endpoint: `POST ${endpointUrl}`,
      model: activeModel,
      task: schemaName,
      status: (err as { statusCode?: number } | null)?.statusCode,
      latencyMs: Date.now() - startTime,
      summary: `[API_ERR] ${provider} structured call failed (${Date.now() - startTime}ms): ${err instanceof Error ? err.message : String(err)}`,
    });
    throw toAiError(err, provider);
  }
}

export async function callUnstructured(
  messages: ChatMessage[],
  taskName = 'unstructured',
  options?: AiCallOptions
): Promise<string | null> {
  return callChatCompletions({ messages, responseFormat: { type: 'none' }, temperature: 0.3 }, taskName, options);
}

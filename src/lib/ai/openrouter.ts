const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const APP_REFERER = process.env.OPENROUTER_REFERER || 'https://gitranked.dev';
const APP_TITLE = process.env.OPENROUTER_TITLE || 'GitRanked';

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

function isApiKeyConfigured() {
  return Boolean(OPENROUTER_API_KEY);
}

async function callOpenRouter(request: CompletionRequest): Promise<string | null> {
  if (!isApiKeyConfigured()) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const body: Record<string, unknown> = {
    model: AI_MODEL,
    messages: request.messages,
  };

  if (request.responseFormat && request.responseFormat.type !== 'none') {
    body.response_format = request.responseFormat;
  }
  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': APP_REFERER,
      'X-Title': APP_TITLE,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new OpenRouterError(response.status, errText);
  }

  const data = (await response.json()) as OpenRouterResponse;
  if (data.error) {
    throw new OpenRouterError(data.error.code ?? 500, data.error.message ?? 'Unknown OpenRouter error');
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenRouter returned an empty response');
  }

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
      const content = await callOpenRouter({ messages, responseFormat, temperature: 0.2 });
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

export async function callUnstructured(messages: ChatMessage[]): Promise<string | null> {
  return callOpenRouter({ messages, responseFormat: { type: 'none' }, temperature: 0.3 });
}

export function hasApiKey() {
  return isApiKeyConfigured();
}

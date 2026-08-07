export const DEFAULT_AI_MODEL = process.env.AI_MODEL || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';

export const RECOMMENDED_AI_MODELS = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron Super 120B (Free)', provider: 'NVIDIA', badge: 'Default' },
  { id: 'google/gemini-2.0-flash-lite-preview-02-05:free', name: 'Gemini 2.0 Flash Lite (Free)', provider: 'Google', badge: 'Fast' },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', provider: 'DeepSeek', badge: 'Reasoning' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', provider: 'Meta', badge: 'Powerful' },
  { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B (Free)', provider: 'Qwen', badge: 'Code' },
  { id: 'mistralai/mistral-small-24b-instruct-2501:free', name: 'Mistral Small 24B (Free)', provider: 'Mistral', badge: 'Balanced' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', badge: 'Flagship' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', badge: 'Popular' },
] as const;

/**
 * Provider catalog of OpenAI-compatible chat-completions endpoints.
 * OpenRouter is the default; the rest are optional alternatives a user can
 * opt into (or fully custom endpoints via the `custom` provider).
 */
export type AiProvider =
  | 'openrouter'
  | 'openai'
  | 'groq'
  | 'together'
  | 'mistral'
  | 'deepseek'
  | 'ollama'
  | 'custom';

export type ProviderConfig = {
  id: AiProvider;
  name: string;
  /** Full chat-completions URL. Empty for `custom` (user-supplied). */
  baseUrl: string;
  description: string;
};

export const DEFAULT_AI_PROVIDER: AiProvider = 'openrouter';

export const AI_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    description: 'Multi-model router with many free and paid models.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    description: 'OpenAI GPT-4o / o-series models.',
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    description: 'Extremely fast inference (Llama, Mixtral, etc.).',
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1/chat/completions',
    description: 'Open models with generous free tier.',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    description: 'Mistral open and commercial models.',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    description: 'DeepSeek chat & reasoning models.',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1/chat/completions',
    description: 'Run models locally on your own machine.',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    description: 'Any OpenAI-compatible endpoint — vLLM, LM Studio, LiteLLM, etc.',
  },
] as const;

export function getProviderConfig(id: AiProvider): ProviderConfig {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0];
}

/**
 * Normalize a user-supplied endpoint into a full chat-completions URL.
 * Accepts either the base URL (e.g. https://api.openai.com/v1) or the full
 * /chat/completions path. Falls back to the provider preset when empty.
 */
export function normalizeEndpoint(input: string, provider: AiProvider = 'openrouter'): string {
  const trimmed = input.trim();
  const base = trimmed || getProviderConfig(provider).baseUrl;
  if (!base) return '';
  const path = base.endsWith('/chat/completions') ? base : `${base.replace(/\/+$/, '')}/chat/completions`;
  return path;
}

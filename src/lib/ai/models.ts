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
  | 'opencode'
  | 'opencode-go'
  | 'custom';

export type ProviderConfig = {
  id: AiProvider;
  name: string;
  /** Full chat-completions URL. Empty for `custom` (user-supplied). */
  baseUrl: string;
  description: string;
};

export const DEFAULT_AI_PROVIDER: AiProvider = 'openrouter';

/** A selectable model entry shown in the settings model dropdown. */
export type ModelPreset = {
  id: string;
  name: string;
  provider?: string;
};

/**
 * Common model ids per provider, so the settings page can offer a searchable
 * model dropdown that matches the selected provider. The id is sent verbatim as
 * the `model` field to that provider's chat-completions endpoint. `custom` is
 * intentionally empty — a free-form model id is required there.
 */
export const MODELS_BY_PROVIDER: Record<AiProvider, ModelPreset[]> = {
  openrouter: [
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron Super 120B (Free)', provider: 'NVIDIA' },
    { id: 'google/gemini-2.0-flash-lite-preview-02-05:free', name: 'Gemini 2.0 Flash Lite (Free)', provider: 'Google' },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', provider: 'Google' },
    { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', provider: 'DeepSeek' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', provider: 'Meta' },
    { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)', provider: 'Meta' },
    { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B (Free)', provider: 'Qwen' },
    { id: 'mistralai/mistral-small-24b-instruct-2501:free', name: 'Mistral Small 24B (Free)', provider: 'Mistral' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
    { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'Anthropic' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
    { id: 'openai/o4-mini', name: 'o4-mini', provider: 'OpenAI' },
    { id: 'openai/gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4.1', name: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano' },
    { id: 'o4-mini', name: 'o4-mini' },
    { id: 'o3', name: 'o3' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' },
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B' },
  ],
  together: [
    { id: 'meta-llama/llama-3.3-70b-instruct-turbo', name: 'Llama 3.3 70B Instruct' },
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', name: 'Llama 3.3 70B (Free)' },
    { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B Instruct' },
    { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B' },
  ],
  mistral: [
    { id: 'mistral-large-latest', name: 'Mistral Large' },
    { id: 'mistral-small-latest', name: 'Mistral Small' },
    { id: 'open-mistral-nemo', name: 'Mistral Nemo' },
    { id: 'codestral-latest', name: 'Codestral' },
    { id: 'ministral-8b-latest', name: 'Ministral 8B' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
  ],
  ollama: [
    { id: 'llama3.2', name: 'Llama 3.2' },
    { id: 'llama3.1', name: 'Llama 3.1' },
    { id: 'qwen2.5', name: 'Qwen 2.5' },
    { id: 'mistral', name: 'Mistral' },
    { id: 'gemma2', name: 'Gemma 2' },
    { id: 'phi4', name: 'Phi-4' },
  ],
  opencode: [
    { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash (Free)', provider: 'DeepSeek' },
    { id: 'big-pickle', name: 'Big Pickle (Free)', provider: 'OpenCode' },
    { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra (Free)', provider: 'NVIDIA' },
    { id: 'mimo-v2.5-free', name: 'MiMo V2.5 (Free)', provider: 'OpenCode' },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'DeepSeek' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'DeepSeek' },
    { id: 'glm-5.1', name: 'GLM 5.1', provider: 'Zhipu' },
    { id: 'kimi-k3', name: 'Kimi K3', provider: 'Moonshot' },
    { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', provider: 'Moonshot' },
    { id: 'minimax-m3', name: 'MiniMax M3', provider: 'MiniMax' },
    { id: 'gpt-5.6-luna', name: 'GPT 5.6 Luna', provider: 'OpenAI' },
  ],
  'opencode-go': [
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'DeepSeek' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'DeepSeek' },
    { id: 'glm-5.1', name: 'GLM 5.1', provider: 'Zhipu' },
    { id: 'glm-5.2', name: 'GLM 5.2', provider: 'Zhipu' },
    { id: 'grok-4.5', name: 'Grok 4.5', provider: 'xAI' },
    { id: 'gpt-5.6-luna', name: 'GPT 5.6 Luna', provider: 'OpenAI' },
    { id: 'hy3', name: 'Hy3', provider: 'OpenCode' },
    { id: 'kimi-k2.6', name: 'Kimi K2.6', provider: 'Moonshot' },
    { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', provider: 'Moonshot' },
    { id: 'kimi-k3', name: 'Kimi K3', provider: 'Moonshot' },
    { id: 'mimo-v2.5', name: 'MiMo V2.5', provider: 'OpenCode' },
    { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro', provider: 'OpenCode' },
    { id: 'minimax-m2.7', name: 'MiniMax M2.7', provider: 'MiniMax' },
    { id: 'minimax-m3', name: 'MiniMax M3', provider: 'MiniMax' },
    { id: 'qwen3.6-plus', name: 'Qwen3.6 Plus', provider: 'Qwen' },
    { id: 'qwen3.7-max', name: 'Qwen3.7 Max', provider: 'Qwen' },
    { id: 'qwen3.7-plus', name: 'Qwen3.7 Plus', provider: 'Qwen' },
    { id: 'qwen3.8-max', name: 'Qwen3.8 Max', provider: 'Qwen' },
  ],
  custom: [],
};

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
    id: 'opencode',
    name: 'OpenCode Zen',
    baseUrl: 'https://opencode.ai/zen/v1/chat/completions',
    description: 'Curated coding models by the OpenCode team (DeepSeek, GLM, Kimi, GPT, more).',
  },
  {
    id: 'opencode-go',
    name: 'OpenCode Go',
    baseUrl: 'https://opencode.ai/zen/go/v1/chat/completions',
    description: 'Low-cost subscription for popular open coding models (DeepSeek, GLM, Kimi, GPT, Qwen).',
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

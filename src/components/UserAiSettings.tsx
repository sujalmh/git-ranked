'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Key,
  Cpu,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  Globe,
  Search,
  ChevronDown,
  Server,
  Lock,
} from 'lucide-react';

interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  description: string;
}

interface ModelPreset {
  id: string;
  name: string;
  provider?: string;
}

interface UserAiSettingsData {
  useCustomKey: boolean;
  hasCustomKeySet: boolean;
  apiKeyMasked: string;
  aiModel: string;
  defaultModel: string;
  aiProvider: string;
  aiEndpoint: string;
  providers?: ProviderConfig[];
  modelsByProvider?: Record<string, ModelPreset[]>;
}

interface DropdownOption {
  id: string;
  name: string;
  sub?: string;
}

function SearchableDropdown({
  icon,
  value,
  valueLabel,
  placeholder,
  searchPlaceholder,
  options,
  onSelect,
  disabled,
  footer,
}: {
  icon?: React.ReactNode;
  value: string;
  valueLabel?: string;
  placeholder: string;
  searchPlaceholder: string;
  options: DropdownOption[];
  onSelect: (option: DropdownOption) => void;
  disabled?: boolean;
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const selected = options.find((o) => o.id === value);
  const filtered = query.trim()
    ? options.filter((o) => `${o.name} ${o.id} ${o.sub ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) setQuery('');
        }}
        className="w-full flex items-center justify-between gap-2 bg-black border border-zinc-700 px-4 py-3 text-sm text-white focus:outline-none focus:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="flex items-center gap-2 min-w-0">
          {icon}
          <span className="truncate">
            {valueLabel ?? (selected ? `${selected.name}${selected.sub ? ` — ${selected.sub}` : ''}` : placeholder)}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-zinc-900 border border-zinc-700 shadow-2xl">
          <div className="p-2 border-b border-zinc-800 flex items-center gap-2">
            <Search className="w-4 h-4 text-zinc-500 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && <div className="px-4 py-3 text-xs text-zinc-500">No matches</div>}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onSelect(o);
                  setOpen(false);
                  setQuery('');
                }}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-left hover:bg-accent/10 ${
                  o.id === value ? 'bg-accent/10 text-accent' : 'text-white'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate">{o.name}</span>
                  {o.sub && <span className="block text-[10px] font-mono text-zinc-500 truncate">{o.sub}</span>}
                </span>
                {o.id === value && <Check className="w-4 h-4 text-accent shrink-0" />}
              </button>
            ))}
          </div>
          {footer && <div className="border-t border-zinc-800">{footer}</div>}
        </div>
      )}
    </div>
  );
}

export function UserAiSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasCustomKeySet, setHasCustomKeySet] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [customModelMode, setCustomModelMode] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');
  const [defaultModel, setDefaultModel] = useState('nvidia/nemotron-3-super-120b-a12b:free');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ModelPreset[]>>({});
  const [aiProvider, setAiProvider] = useState('openrouter');
  const [endpointInput, setEndpointInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const currentModels = (aiProvider === 'custom' ? [] : (modelsByProvider[aiProvider] ?? [])) as ModelPreset[];
  const isApiKeySet = hasCustomKeySet || apiKeyInput.trim().length > 0;

  useEffect(() => {
    let cancelled = false;

    fetch('/api/user/ai-settings')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch user AI settings');
        return res.json() as Promise<UserAiSettingsData>;
      })
      .then((data) => {
        if (cancelled) return;
        setHasCustomKeySet(data.hasCustomKeySet);
        setApiKeyInput(data.apiKeyMasked);
        setDefaultModel(data.defaultModel);
        setAiProvider(data.aiProvider || 'openrouter');
        setEndpointInput(data.aiEndpoint || '');
        if (data.providers) setProviders(data.providers);
        if (data.modelsByProvider) setModelsByProvider(data.modelsByProvider);

        const provider = data.aiProvider || 'openrouter';
        const list = (provider === 'custom' ? [] : (data.modelsByProvider?.[provider] ?? [])) as ModelPreset[];
        if (provider === 'custom') {
          setCustomModelMode(true);
          setCustomModelInput(data.aiModel);
        } else if (list.some((m) => m.id === data.aiModel)) {
          setSelectedModel(data.aiModel);
          setCustomModelMode(false);
        } else if (data.aiModel) {
          setCustomModelMode(true);
          setCustomModelInput(data.aiModel);
        } else {
          setSelectedModel(list[0]?.id ?? '');
          setCustomModelMode(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setStatusMessage({ text: 'Failed to load AI settings', type: 'error' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleProviderSelect = (opt: DropdownOption) => {
    setAiProvider(opt.id);
    setEndpointInput('');
    if (opt.id === 'custom') {
      setCustomModelMode(true);
      setCustomModelInput('');
      setSelectedModel('');
    } else {
      const list = (modelsByProvider[opt.id] ?? []) as ModelPreset[];
      setCustomModelMode(false);
      setCustomModelInput('');
      setSelectedModel(list[0]?.id ?? '');
    }
  };

  const modelToSave = customModelMode ? customModelInput.trim() : selectedModel;
  const providerOption = providers.find((p) => p.id === aiProvider);

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);

    if (!modelToSave) {
      setStatusMessage({ text: 'Please select or enter a model.', type: 'error' });
      setSaving(false);
      return;
    }
    if (aiProvider === 'custom' && !endpointInput.trim()) {
      setStatusMessage({ text: 'A custom provider requires an endpoint URL.', type: 'error' });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/user/ai-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKeyInput.trim(),
          aiModel: modelToSave,
          aiProvider,
          aiEndpoint: aiProvider === 'custom' ? endpointInput.trim() : '',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');

      setHasCustomKeySet(data.settings.hasCustomKeySet);
      setApiKeyInput(data.settings.apiKeyMasked);
      setSelectedModel(data.settings.aiModel);
      setAiProvider(data.settings.aiProvider || 'openrouter');
      setEndpointInput(data.settings.aiEndpoint || '');
      if (data.settings.aiModel && !(currentModels.some((m) => m.id === data.settings.aiModel))) {
        setCustomModelMode(true);
        setCustomModelInput(data.settings.aiModel);
      }

      setStatusMessage({
        text: 'AI settings updated successfully!',
        type: 'success',
      });
    } catch (err) {
      setStatusMessage({
        text: err instanceof Error ? err.message : 'Error updating settings',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 brutal-card flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const modelOptions: DropdownOption[] = currentModels.map((m) => ({
    id: m.id,
    name: m.name,
    sub: m.id,
  }));

  return (
    <div className="brutal-card p-6 md:p-8 space-y-8 bg-zinc-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-accent" />
            <h2 className="text-xl font-bold tracking-tight uppercase">AI Provider & Model Configuration</h2>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Connect your own AI endpoint, pick a provider and model, and add your API key. Leave the key empty to use the
            system default.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 border text-sm font-medium flex items-center gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
              : 'bg-red-950/40 border-red-500/50 text-red-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <Check className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Step 1 — Provider */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-300">
          <Globe className="w-4 h-4 text-accent" />
          1. Provider
        </label>
        <SearchableDropdown
          icon={<Globe className="w-4 h-4 text-zinc-500 shrink-0" />}
          value={aiProvider}
          valueLabel={providerOption ? `${providerOption.name} — ${providerOption.description}` : undefined}
          placeholder="Select an AI provider…"
          searchPlaceholder="Search providers…"
          options={providers.map((p) => ({ id: p.id, name: p.name, sub: p.description }))}
          onSelect={handleProviderSelect}
        />
        {providerOption?.baseUrl && (
          <p className="text-xs text-zinc-500 font-mono truncate">Endpoint: {providerOption.baseUrl}</p>
        )}
      </div>

      {/* Step 2 — Model */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-300">
            <Cpu className="w-4 h-4 text-accent" />
            2. Model
          </label>
          {customModelMode && (
            <button
              type="button"
              onClick={() => setCustomModelMode(false)}
              className="text-xs text-zinc-400 hover:text-white underline underline-offset-2"
            >
              Back to presets
            </button>
          )}
        </div>

        {!customModelMode ? (
          <SearchableDropdown
            icon={<Cpu className="w-4 h-4 text-zinc-500 shrink-0" />}
            value={selectedModel}
            placeholder={aiProvider === 'custom' ? 'Custom model id required…' : 'Select a model…'}
            searchPlaceholder="Search models…"
            options={modelOptions}
            onSelect={(opt) => setSelectedModel(opt.id)}
            disabled={aiProvider === 'custom'}
            footer={
              <button
                type="button"
                onClick={() => setCustomModelMode(true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-accent hover:bg-accent/10 text-left"
              >
                <Server className="w-4 h-4" />
                Enter a custom model id…
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={customModelInput}
              onChange={(e) => setCustomModelInput(e.target.value)}
              placeholder={
                aiProvider === 'custom'
                  ? 'e.g. local-model, my-model-name'
                  : 'e.g. google/gemini-2.0-flash-001 or anthropic/claude-3.5-sonnet'
              }
              className="w-full bg-black border border-zinc-700 px-4 py-3 text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-accent"
            />
            <p className="text-xs text-zinc-500">
              {aiProvider === 'custom'
                ? `Enter the model id your ${providerOption?.name ?? 'custom'} endpoint expects.`
                : 'Enter any model id this provider exposes (it is sent verbatim to the chat-completions endpoint).'}
            </p>
          </div>
        )}
      </div>

      {/* Step 3 — API Key */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-300">
          <Key className="w-4 h-4 text-accent" />
          3. API Key
        </label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Paste your API key for the selected provider…"
            className="w-full bg-black border border-zinc-700 px-4 py-3 text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
            aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
          >
            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div
          className={`p-3 border text-xs font-medium flex items-center gap-2 ${
            isApiKeySet
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
              : 'bg-zinc-900/40 border-zinc-800 text-zinc-400'
          }`}
        >
          {isApiKeySet ? (
            <>
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Your key will be used for requests. Leave un-edited to keep the existing key.</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
              <span>
                No key set — requests will use the system default key & model ({defaultModel}). Add a key to activate
                your own provider & model.
              </span>
            </>
          )}
        </div>
      </div>

      {/* Step 4 — Custom endpoint (only for the custom provider) */}
      {aiProvider === 'custom' && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-300">
            <Server className="w-4 h-4 text-accent" />
            4. Endpoint URL
          </label>
          <input
            type="text"
            value={endpointInput}
            onChange={(e) => setEndpointInput(e.target.value)}
            placeholder="https://your-llm-server/v1"
            className="w-full bg-black border border-zinc-700 px-4 py-3 text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-accent"
          />
          <p className="text-xs text-zinc-500">
            Any OpenAI-compatible endpoint — vLLM, LM Studio, LiteLLM, Ollama, etc. Base URLs (e.g.
            https://your-server/v1) automatically get /chat/completions appended. Required for the custom provider.
          </p>
        </div>
      )}

      {/* Action Footer */}
      <div className="pt-4 border-t border-zinc-800 flex items-center justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-accent text-black font-bold uppercase tracking-wider text-sm hover:bg-[#b8e600] disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          SAVE AI SETTINGS
        </button>
      </div>
    </div>
  );
}

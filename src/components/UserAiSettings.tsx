'use client';

import { useState, useEffect } from 'react';
import { Key, Cpu, Check, AlertCircle, Eye, EyeOff, Loader2, Sparkles, Lock } from 'lucide-react';

interface PresetModel {
  id: string;
  name: string;
  provider: string;
}

interface UserAiSettingsData {
  useCustomKey: boolean;
  hasCustomKeySet: boolean;
  apiKeyMasked: string;
  aiModel: string;
  defaultModel: string;
  presets?: PresetModel[];
}

export function UserAiSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useCustomKey, setUseCustomKey] = useState(false);
  const [hasCustomKeySet, setHasCustomKeySet] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [defaultModel, setDefaultModel] = useState('tencent/hy3:free');
  const [presets, setPresets] = useState<PresetModel[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/user/ai-settings');
      if (!res.ok) throw new Error('Failed to fetch user AI settings');
      const data: UserAiSettingsData = await res.json();

      setUseCustomKey(data.useCustomKey);
      setHasCustomKeySet(data.hasCustomKeySet);
      setApiKeyInput(data.apiKeyMasked);
      setSelectedModel(data.aiModel);
      setDefaultModel(data.defaultModel);
      if (data.presets) setPresets(data.presets);

      const isPreset = data.presets?.some((p) => p.id === data.aiModel);
      if (!isPreset && data.aiModel) {
        setIsCustomMode(true);
        setCustomModelInput(data.aiModel);
      }
    } catch (err) {
      console.error(err);
      setStatusMessage({ text: 'Failed to load AI settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const isApiKeySet = useCustomKey && (hasCustomKeySet || apiKeyInput.trim().length > 0);

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);

    const modelToSave = isCustomMode ? customModelInput.trim() : selectedModel;

    try {
      const res = await fetch('/api/user/ai-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useCustomKey,
          openrouterApiKey: apiKeyInput.trim(),
          aiModel: modelToSave,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');

      setUseCustomKey(data.settings.useCustomKey);
      setHasCustomKeySet(data.settings.hasCustomKeySet);
      setApiKeyInput(data.settings.apiKeyMasked);
      setSelectedModel(data.settings.aiModel);

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
        <Loader2 className="w-8 h-8 animate-spin text-[#ccff00]" />
      </div>
    );
  }

  return (
    <div className="brutal-card p-6 md:p-8 space-y-8 bg-zinc-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-[#ccff00]" />
            <h2 className="text-xl font-bold tracking-tight uppercase">AI Key & Model Configuration</h2>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Choose whether to use your custom OpenRouter key or fall back to the system default.
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

      {/* Toggle Custom Key */}
      <div className="p-4 sm:p-6 border border-zinc-800 bg-zinc-950 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <label className="text-base font-bold text-white uppercase flex items-center gap-2">
            <Key className="w-4 h-4 text-[#ccff00]" />
            Use Personal OpenRouter API Key
          </label>
          <p className="text-xs text-zinc-400">
            {useCustomKey
              ? 'Active: Your requests will use your personal OpenRouter API Key.'
              : `Inactive: Using system default key & default model (${defaultModel}).`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUseCustomKey(!useCustomKey)}
          className={`relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer transition-colors duration-200 ease-in-out border-2 ${
            useCustomKey ? 'bg-[#ccff00] border-[#ccff00]' : 'bg-zinc-800 border-zinc-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform bg-black shadow transition duration-200 ease-in-out ${
              useCustomKey ? 'translate-x-7' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* API Key Input */}
      {useCustomKey && (
        <div className="space-y-3 p-5 border border-zinc-800 bg-zinc-900/30">
          <label className="block text-sm font-bold uppercase tracking-wider text-zinc-300">
            OpenRouter API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full bg-black border border-zinc-700 px-4 py-3 text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-[#ccff00]"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Your key is securely stored in your user profile. Leave un-edited to keep your existing key.
          </p>
        </div>
      )}

      {/* Model Selection */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#ccff00]" />
            AI Model Preference
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isApiKeySet}
              onClick={() => setIsCustomMode(false)}
              className={`text-xs px-3 py-1 font-bold border transition-colors ${
                !isCustomMode
                  ? 'bg-[#ccff00] text-black border-[#ccff00]'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              PRESETS
            </button>
            <button
              type="button"
              disabled={!isApiKeySet}
              onClick={() => setIsCustomMode(true)}
              className={`text-xs px-3 py-1 font-bold border transition-colors ${
                isCustomMode
                  ? 'bg-[#ccff00] text-black border-[#ccff00]'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              CUSTOM SLUG
            </button>
          </div>
        </div>

        {!isApiKeySet && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              Model selection is locked. You must enable and set your personal OpenRouter API key above to change your AI model.
            </span>
          </div>
        )}

        {!isCustomMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {presets.map((preset) => {
              const isSelected = selectedModel === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!isApiKeySet}
                  onClick={() => setSelectedModel(preset.id)}
                  className={`p-4 text-left border transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-[#ccff00]/10 border-[#ccff00] text-white'
                      : 'bg-black border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <div>
                    <div className="font-bold text-sm">{preset.name}</div>
                    <div className="text-xs font-mono text-zinc-500 mt-1">{preset.id}</div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[#ccff00] flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              disabled={!isApiKeySet}
              value={customModelInput}
              onChange={(e) => setCustomModelInput(e.target.value)}
              placeholder="e.g. google/gemini-2.0-flash-lite-001 or nvidia/nemotron-3-super-120b-a12b:free"
              className="w-full bg-black border border-zinc-700 px-4 py-3 text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-[#ccff00] disabled:opacity-40 disabled:cursor-not-allowed disabled:border-zinc-800"
            />
            <p className="text-xs text-zinc-500">
              Enter any supported OpenRouter model slug.
            </p>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-4 border-t border-zinc-800 flex items-center justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-[#ccff00] text-black font-bold uppercase tracking-wider text-sm hover:bg-[#b8e600] disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          SAVE AI SETTINGS
        </button>
      </div>
    </div>
  );
}

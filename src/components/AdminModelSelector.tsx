'use client';

import React, { useState, useEffect } from 'react';
import { Cpu, CheckCircle2, Loader2, Sparkles, Server } from 'lucide-react';
import { RECOMMENDED_AI_MODELS } from '@/lib/ai/models';

export function AdminModelSelector({ initialModel }: { initialModel?: string }) {
  const [currentModel, setCurrentModel] = useState<string>(initialModel || 'nvidia/nemotron-3-super-120b-a12b:free');
  const [customModel, setCustomModel] = useState<string>('');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Keep custom mode in sync with the currently selected model.
  const [prevModel, setPrevModel] = useState(currentModel);
  if (prevModel !== currentModel) {
    setPrevModel(currentModel);
    const isPreset = RECOMMENDED_AI_MODELS.some((m) => m.id === currentModel);
    if (!isPreset && currentModel) {
      setIsCustomMode(true);
      setCustomModel(currentModel);
    } else {
      setIsCustomMode(false);
    }
  }

  useEffect(() => {
    if (!initialModel) {
      fetch('/api/admin/model')
        .then((res) => res.json())
        .then((data) => {
          if (data.currentModel) {
            setCurrentModel(data.currentModel);
          }
        })
        .catch(() => {});
    }
  }, [initialModel]);

  const handleSaveModel = async (modelToSave: string) => {
    if (!modelToSave.trim()) return;
    setLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/admin/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelToSave.trim() }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setCurrentModel(data.model);
        setStatusMessage({ text: `AI Model successfully set to ${data.model}`, type: 'success' });
      } else {
        throw new Error(data.error || 'Failed to update AI model');
      }
    } catch (err) {
      setStatusMessage({
        text: err instanceof Error ? err.message : 'Error updating model',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePresetSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'CUSTOM') {
      setIsCustomMode(true);
      setCustomModel(currentModel);
    } else {
      setIsCustomMode(false);
      handleSaveModel(val);
    }
  };

  return (
    <div className="p-8 rounded-2xl bg-zinc-950 border border-zinc-900 shadow-2xl relative overflow-hidden">
      {/* Glow highlight */}
      <div className="absolute -top-24 -right-24 w-60 h-60 bg-accent text-black/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent border border-accent text-accent">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
              AI Engine & Model Configuration
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Select or configure the LLM used for AI classifications, repository summaries, and contributor profiles.
            </p>
          </div>
        </div>

        {/* Current Active Badge */}
        <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span className="font-medium text-zinc-400">Active:</span>
          <span className="font-mono text-accent truncate max-w-[200px]">{currentModel}</span>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {/* Preset Selector */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 relative">
            <select
              value={isCustomMode ? 'CUSTOM' : currentModel}
              disabled={loading}
              onChange={handlePresetSelect}
              className="w-full bg-zinc-900/90 text-zinc-100 text-sm font-medium border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent appearance-none cursor-pointer transition-all pr-10"
            >
              {RECOMMENDED_AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} [{m.provider}] — {m.badge}
                </option>
              ))}
              <option value="CUSTOM">🔧 Custom OpenRouter Model ID...</option>
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
              ▼
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-accent bg-accent border border-accent rounded-xl">
              <Loader2 className="w-4 h-4 animate-spin" />
              Applying model...
            </div>
          )}
        </div>

        {/* Custom Model Input */}
        {isCustomMode && (
          <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-3 animate-in fade-in duration-200">
            <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-zinc-400" />
              OpenRouter Model Identifier
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="e.g. anthropic/claude-3.5-sonnet or meta-llama/llama-3.1-405b-instruct"
                className="flex-1 bg-black text-zinc-100 text-sm font-mono border border-zinc-800 rounded-lg px-3.5 py-2 focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => handleSaveModel(customModel)}
                disabled={loading || !customModel.trim()}
                className="px-4 py-2 bg-accent text-black hover:bg-white disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 shrink-0"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save Custom Model
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Any valid OpenRouter model string can be entered (e.g. <code className="text-zinc-400">google/gemini-2.0-pro-exp-02-05:free</code>).
            </p>
          </div>
        )}

        {/* Model Presets Quick-Pills */}
        <div className="pt-2">
          <p className="text-xs text-zinc-500 mb-2.5 font-medium">Quick Presets:</p>
          <div className="flex flex-wrap gap-2">
            {RECOMMENDED_AI_MODELS.map((m) => {
              const isActive = currentModel === m.id && !isCustomMode;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setIsCustomMode(false);
                    handleSaveModel(m.id);
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-accent/20 border-accent/50 text-accent font-semibold'
                      : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <span>{m.name.split(' (')[0]}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-zinc-400 border border-white/5">
                    {m.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Feedback Message */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl text-xs font-medium border transition-all ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-red-500/10 border-red-500/20 text-red-300'
            }`}
          >
            {statusMessage.text}
          </div>
        )}
      </div>
    </div>
  );
}

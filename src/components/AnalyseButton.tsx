'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, RefreshCw, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

type Step = {
  key: string;
  label: string;
  status: StepStatus;
  message?: string;
};

const STEP_LABELS: Record<string, string> = {
  classifying: 'Classifying events',
  health_metrics: 'Health metrics',
  repository_summary: 'Repository summary',
  team_insights: 'Team insights',
  contributor_profiles: 'Contributor profiles',
  impact_analysis: 'Impact analysis',
};

const STEP_ORDER = Object.keys(STEP_LABELS);

const INITIAL_STEPS: Step[] = STEP_ORDER.map((key) => ({
  key,
  label: STEP_LABELS[key],
  status: 'pending',
}));

export function AnalyseButton({
  owner,
  name,
  isReanalyse,
}: {
  owner: string;
  name: string;
  isReanalyse?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [showProgress, setShowProgress] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const router = useRouter();

  const handleAnalyse = useCallback(async () => {
    setLoading(true);
    setShowProgress(true);
    setHasError(false);
    setIsComplete(false);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: 'pending' as StepStatus })));

    try {
      const res = await fetch(`/api/repos/${owner}/${name}/analyse`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error(`Analysis failed: ${res.status}`);
      }

      if (!res.body) {
        throw new Error('No response stream');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as {
              step: string;
              status: string;
              message: string;
              detail?: unknown;
            };

            if (event.step === 'analysis' && event.status === 'complete') {
              setIsComplete(true);
              setSteps((prev) =>
                prev.map((s) =>
                  s.status === 'pending' || s.status === 'running'
                    ? { ...s, status: 'done' as StepStatus }
                    : s
                )
              );
              // Refresh the page data, then close the modal so the user
              // sees the results. The refresh is triggered first, then we
              // wait a bit for the server components to re-render before
              // hiding the overlay.
              router.refresh();
              setTimeout(() => {
                router.refresh();
                setShowProgress(false);
                setLoading(false);
              }, 1500);
              continue;
            }

            setSteps((prev) =>
              prev.map((s) => {
                if (s.key === event.step) {
                  return {
                    ...s,
                    status: event.status as StepStatus,
                    message: event.message,
                  };
                }
                return s;
              })
            );

            if (event.status === 'error') {
              setHasError(true);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (err) {
      console.error('Analysis failed:', err);
      setHasError(true);
      setSteps((prev) =>
        prev.map((s) => (s.status === 'running' ? { ...s, status: 'error' as StepStatus, message: 'Connection lost' } : s))
      );
    } finally {
      setLoading(false);
    }
  }, [owner, name, router]);

  const completedCount = steps.filter((s) => s.status === 'done').length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleAnalyse}
        disabled={loading}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
          loading
            ? 'bg-indigo-600/50 text-indigo-200 cursor-not-allowed'
            : isComplete
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
        }`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isComplete ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : isReanalyse ? (
          <RefreshCw className="w-4 h-4" />
        ) : (
          <Brain className="w-4 h-4" />
        )}
        {loading ? 'Analyzing...' : isComplete ? 'Done' : isReanalyse ? 'Re-analyse' : 'Analyse Repository'}
      </button>

      {showProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !loading && setShowProgress(false)}>
          <div
            className="sleek-panel p-6 w-full max-w-md mx-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              {hasError ? (
                <AlertCircle className="w-5 h-5 text-amber-400" />
              ) : isComplete ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
              )}
              <h3 className="text-lg font-bold text-white">
                {hasError ? 'Analysis issues' : isComplete ? 'Analysis complete' : 'Analyzing repository'}
              </h3>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  hasError ? 'bg-amber-500' : isComplete ? 'bg-emerald-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="text-xs text-zinc-500 text-right">
              {completedCount} / {steps.length} steps
            </div>

            {/* Step list */}
            <div className="space-y-2.5">
              {steps.map((step) => (
                <div key={step.key} className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {step.status === 'done' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : step.status === 'running' ? (
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    ) : step.status === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-white/10 flex items-center justify-center">
                        <div className="w-1 h-1 rounded-full bg-white/20" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${
                      step.status === 'done' ? 'text-zinc-300' :
                      step.status === 'running' ? 'text-white' :
                      step.status === 'error' ? 'text-amber-300' :
                      'text-zinc-500'
                    }`}>
                      {step.label}
                    </div>
                    {step.message && step.status !== 'pending' && (
                      <div className="text-xs text-zinc-500 truncate">{step.message}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {isComplete && (
              <button
                onClick={() => {
                  setShowProgress(false);
                  router.refresh();
                }}
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 text-sm transition-colors"
              >
                View Results
              </button>
            )}

            {hasError && !loading && (
              <button
                onClick={() => setShowProgress(false)}
                className="w-full rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 font-medium py-2.5 text-sm transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

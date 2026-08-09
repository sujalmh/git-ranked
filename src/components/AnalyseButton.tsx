'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Brain,
  RefreshCw,
  CheckCircle2,
  Loader2,
  Terminal,
  Copy,
  Check,
} from 'lucide-react';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

type Step = {
  key: string;
  label: string;
  status: StepStatus;
  message?: string;
};

export type LogEntry = {
  id: string;
  timestamp: string;
  stepKey: string;
  status: 'running' | 'done' | 'error' | 'info' | 'complete';
  text: string;
};

const STEP_LABELS: Record<string, string> = {
  classifying: 'Classifying events',
  work_units: 'Extracting work units',
  scoring: 'Computing impact scores',
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

function formatTimestamp(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showProgress, setShowProgress] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [showModeDialog, setShowModeDialog] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Auto-scroll terminal container when new logs stream in
  useEffect(() => {
    if (showProgress && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showProgress]);

  const addLog = useCallback((stepKey: string, status: LogEntry['status'], text: string) => {
    const newEntry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: formatTimestamp(),
      stepKey,
      status,
      text,
    };
    setLogs((prev) => [...prev, newEntry]);
  }, []);

  const handleAnalyse = useCallback(
    async (mode: 'cache' | 'fresh') => {
      setShowModeDialog(false);
      setLoading(true);
      setShowProgress(true);
      setHasError(false);
      setIsComplete(false);
      setLogs([]);
      setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: 'pending' as StepStatus })));

      addLog('system', 'info', `[INIT] Starting pipeline analysis for repository ${owner}/${name} (mode: ${mode})...`);

      try {
        const res = await fetch(`/api/repos/${owner}/${name}/analyse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });

        if (!res.ok) {
          let message = `HTTP ${res.status}: ${res.statusText || 'Analysis request failed'}`;
          if (res.status === 429) {
            const data = (await res.json().catch(() => null)) as { error?: string } | null;
            message = data?.error || 'Daily analysis limit reached. You can run one analysis per day.';
          }
          throw new Error(message);
        }

        if (!res.body) {
          throw new Error('No readable response stream received');
        }

        addLog('system', 'info', `[STREAM] Connection established. Processing pipeline tasks...`);

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
                status: 'running' | 'done' | 'error' | 'complete';
                message: string;
                detail?: unknown;
              };

              if (event.step === 'analysis' && event.status === 'complete') {
                setIsComplete(true);
                addLog('system', 'complete', `[SUCCESS] Pipeline execution finished successfully. All tasks complete.`);
                setSteps((prev) =>
                  prev.map((s) =>
                    s.status === 'pending' || s.status === 'running'
                      ? { ...s, status: 'done' as StepStatus }
                      : s
                  )
                );
                router.refresh();
                continue;
              }

              // Update step status
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

              // Log output line
              let detailStr = '';
              if (event.detail && typeof event.detail === 'object') {
                detailStr = ` (${JSON.stringify(event.detail)})`;
              }
              addLog(event.step, event.status, `${event.message}${detailStr}`);

              if (event.status === 'error') {
                setHasError(true);
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Analysis failed:', err);
        setHasError(true);
        addLog('system', 'error', `[FAIL] Pipeline aborted with error: ${errorMsg}`);
        setSteps((prev) =>
          prev.map((s) => (s.status === 'running' ? { ...s, status: 'error' as StepStatus, message: 'Execution failed' } : s))
        );
      } finally {
        setLoading(false);
      }
    },
    [owner, name, router, addLog]
  );

  const onButtonClick = () => {
    if (isReanalyse) {
      setShowModeDialog(true);
    } else {
      handleAnalyse('fresh');
    }
  };

  const copyTerminalLogs = () => {
    const rawText = logs
      .map((l) => `[${l.timestamp}] [${l.status.toUpperCase()}] [${l.stepKey}] ${l.text}`)
      .join('\n');
    navigator.clipboard.writeText(rawText);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const completedCount = steps.filter((s) => s.status === 'done').length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="flex flex-col gap-3">
      {/* Trigger Button */}
      <button
        onClick={onButtonClick}
        disabled={loading}
        className={`flex items-center gap-2.5 rounded-xl px-6 py-3 text-base font-semibold transition-all shadow-lg ${
          loading
            ? 'bg-accent/50 text-black/70 cursor-not-allowed'
            : isComplete
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/30'
              : 'bg-accent text-black hover:bg-white hover:text-black'
        }`}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isComplete ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : isReanalyse ? (
          <RefreshCw className="w-5 h-5" />
        ) : (
          <Brain className="w-5 h-5" />
        )}
        {loading ? 'Analyzing Pipeline...' : isComplete ? 'Done' : isReanalyse ? 'Re-analyse' : 'Analyse Repository'}
      </button>

      {/* Mode Selection Dialog (re-analysis only) */}
      {showModeDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose analysis mode"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setShowModeDialog(false)}
        >
          <div
            className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white">How would you like to re-analyse?</h3>
              <p className="text-sm text-zinc-400 mt-1">
                Reuse previously cached results, or force a completely fresh run (clears cached AI summaries and re-extracts work units).
              </p>
            </div>
            <div className="p-6 grid gap-3">
              <button
                type="button"
                onClick={() => handleAnalyse('cache')}
                className="text-left p-4 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-accent/50 hover:bg-zinc-800/80 transition-colors"
              >
                <div className="text-white font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-accent" />
                  Use cached results
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  Fast — reuses existing AI summaries and work-unit extractions where available.
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleAnalyse('fresh')}
                className="text-left p-4 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-accent/50 hover:bg-zinc-800/80 transition-colors"
              >
                <div className="text-white font-semibold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-cyan-400" />
                  Fresh run (no cache)
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  Slower — clears cached AI summaries and re-extracts all work units with the current model.
                </div>
              </button>
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModeDialog(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Progress Overlay Modal */}
      {showProgress && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Analysis progress for ${owner}/${name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6"
          onClick={() => !loading && setShowProgress(false)}
        >
          <div
            className="w-full max-w-2xl bg-zinc-950 border border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Terminal Top Window Bar */}
            <div className="px-4 py-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80 border border-red-600/40" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80 border border-yellow-600/40" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-600/40" />
                </div>
                <div className="h-4 w-px bg-zinc-800 mx-1" />
                <Terminal className="w-4 h-4 text-zinc-400" />
                <span className="font-mono text-xs font-semibold text-zinc-300">
                  gitranked-pipeline ~ {owner}/{name}
                </span>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyTerminalLogs}
                  title="Copy log text"
                  className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 rounded-lg text-xs font-mono transition-colors flex items-center gap-1"
                >
                  {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{copiedLogs ? 'Copied' : 'Copy'}</span>
                </button>
                <div
                  className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-medium flex items-center gap-1.5 ${
                    hasError
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : isComplete
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-accent/20 text-accent border border-accent/30'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      hasError
                        ? 'bg-amber-400'
                        : isComplete
                          ? 'bg-emerald-400'
                          : 'bg-accent animate-pulse'
                    }`}
                  />
                  {hasError ? 'ERROR' : isComplete ? 'COMPLETE' : 'RUNNING'}
                </div>
              </div>
            </div>

            {/* Step Summary Bar */}
            <div className="px-5 py-3 bg-black/60 border-b border-zinc-900 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-zinc-400">
                  Progress: <strong className="text-zinc-200">{completedCount}</strong>/{steps.length} tasks
                </span>
                <span className="font-mono text-accent font-bold">{progressPct}%</span>
              </div>

              {/* Progress bar */}
              <div className="flex-1 max-w-xs h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800/80">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    hasError ? 'bg-amber-500' : isComplete ? 'bg-emerald-500' : 'bg-accent'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Terminal Scrolling Log View */}
            <div className="p-4 bg-black font-mono text-xs overflow-y-auto flex-1 space-y-2 min-h-[260px] max-h-[400px] select-text scrollbar-thin scrollbar-thumb-zinc-800">
              {logs.map((log) => {
                let badgeColor = 'text-zinc-400 border-zinc-800 bg-zinc-900/40';
                let textColor = 'text-zinc-300';

                if (log.status === 'running') {
                  badgeColor = 'text-cyan-400 border-cyan-500/30 bg-cyan-950/40';
                  textColor = 'text-cyan-200';
                } else if (log.status === 'done') {
                  badgeColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-950/40';
                  textColor = 'text-zinc-200';
                } else if (log.status === 'complete') {
                  badgeColor = 'text-emerald-300 border-emerald-400/40 bg-emerald-900/50 font-bold';
                  textColor = 'text-emerald-300 font-semibold';
                } else if (log.status === 'error') {
                  badgeColor = 'text-amber-400 border-amber-500/30 bg-amber-950/40';
                  textColor = 'text-amber-300';
                } else if (log.status === 'info') {
                  badgeColor = 'text-accent border-accent bg-accent';
                  textColor = 'text-zinc-400';
                }

                return (
                  <div key={log.id} className="flex items-start gap-2.5 leading-relaxed hover:bg-zinc-900/40 rounded px-1 py-0.5 transition-colors">
                    <span className="text-zinc-600 shrink-0 select-none">{log.timestamp}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] uppercase rounded border shrink-0 font-semibold ${badgeColor}`}>
                      {log.status === 'running' ? 'RUN' : log.status === 'done' ? 'OK' : log.status.toUpperCase()}
                    </span>
                    <span className={`break-words ${textColor}`}>{log.text}</span>
                  </div>
                );
              })}

              {/* Blinking prompt line */}
              <div className="flex items-center gap-2 pt-1 text-zinc-500">
                <span className="text-accent font-bold">❯</span>
                {loading ? (
                  <span className="animate-pulse text-cyan-400">Processing stream data...</span>
                ) : isComplete ? (
                  <span className="text-emerald-400">Pipeline ready. Click View Results to inspect analysis.</span>
                ) : (
                  <span className="text-zinc-600">Idle</span>
                )}
                <span className="w-2 h-4 bg-accent animate-pulse inline-block" />
              </div>

              {/* Dummy element for smooth auto-scroll */}
              <div ref={logsEndRef} />
            </div>

            {/* Modal Bottom Footer */}
            <div className="p-4 bg-zinc-900/80 border-t border-zinc-800 flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-zinc-400 truncate">
                {isComplete ? (
                  <span className="text-emerald-400 font-medium">✓ Analysis finished. Visuals updated.</span>
                ) : hasError ? (
                  <span className="text-amber-400 font-medium">⚠ Pipeline hit errors during execution.</span>
                ) : (
                  <span className="text-zinc-500">Real-time log stream connected</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isComplete && (
                  <button
                    onClick={() => {
                      setShowProgress(false);
                      router.refresh();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-all shadow-lg shadow-emerald-900/40 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    View Results
                  </button>
                )}

                {!loading && (
                  <button
                    onClick={() => {
                      setShowProgress(false);
                      if (isComplete) router.refresh();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs transition-colors"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

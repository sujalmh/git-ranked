'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  GitBranch,
  Loader2,
  CheckCircle2,
  Download,
  Terminal,
  Copy,
  Check,
} from 'lucide-react';

export type LogEntry = {
  id: string;
  timestamp: string;
  stepKey: string;
  status: 'running' | 'done' | 'error' | 'info' | 'complete';
  text: string;
};

function formatTimestamp(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function InitializeButton({ owner, name }: { owner: string; name: string }) {
  const [loading, setLoading] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasError, setHasError] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

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

  const handleInitialize = useCallback(async () => {
    setLoading(true);
    setShowProgress(true);
    setHasError(false);
    setIsComplete(false);
    setLogs([]);
    setStatusMessage('Connecting to GitHub API...');

    addLog('system', 'info', `[INIT] Starting initialization for repository ${owner}/${name}...`);

    try {
      const res = await fetch(`/api/repos/${owner}/${name}/initialize`, {
        method: 'POST',
      });

      if (res.status === 410) {
        setHasError(true);
        setStatusMessage('The GitHub App installation has been removed. Reinstall the app.');
        addLog('system', 'error', `[FAIL] 410: GitHub App installation missing or deleted.`);
        setLoading(false);
        return;
      }

      if (!res.ok && res.status !== 200) {
        const data = await res.json().catch(() => ({}));
        const errMsg = data.error || `HTTP ${res.status}`;
        setHasError(true);
        setStatusMessage(errMsg);
        addLog('system', 'error', `[FAIL] Repository initialization failed: ${errMsg}`);
        setLoading(false);
        return;
      }

      // Check if already initialized (JSON response)
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.alreadyInitialized) {
          setIsComplete(true);
          setStatusMessage('Repository already initialized.');
          addLog('system', 'complete', `[OK] Repository is already initialized and up to date.`);
          setLoading(false);
          router.refresh();
          return;
        }
      }

      if (!res.body) {
        setHasError(true);
        setStatusMessage('No readable response stream received.');
        addLog('system', 'error', `[FAIL] Response body stream unavailable.`);
        setLoading(false);
        return;
      }

      addLog('system', 'info', `[STREAM] Connected to GitHub event ingestion pipeline...`);

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
            };

            setStatusMessage(event.message);

            if (event.step === 'init' && event.status === 'complete') {
              if (event.message.includes('failed') || event.message.includes('No recent')) {
                const isFail = event.message.includes('failed');
                if (isFail) setHasError(true);
                else setIsComplete(true);
                addLog('system', isFail ? 'error' : 'complete', `[INIT] ${event.message}`);
              } else {
                setIsComplete(true);
                addLog('system', 'complete', `[SUCCESS] Repository initialization completed successfully.`);
              }
              setLoading(false);
              setTimeout(() => router.refresh(), 800);
              continue;
            }

            addLog(event.step, event.status as LogEntry['status'], event.message);

            if (event.status === 'error') {
              setHasError(true);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Initialization failed:', err);
      setHasError(true);
      setStatusMessage(errorMsg);
      addLog('system', 'error', `[FAIL] Connection error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }, [owner, name, router, addLog]);

  const copyTerminalLogs = () => {
    const rawText = logs
      .map((l) => `[${l.timestamp}] [${l.status.toUpperCase()}] [${l.stepKey}] ${l.text}`)
      .join('\n');
    navigator.clipboard.writeText(rawText);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Trigger Button */}
      <button
        onClick={handleInitialize}
        disabled={loading}
        className={`flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold uppercase tracking-wider transition-all shadow-lg ${
          loading
            ? 'bg-accent/50 text-black/70 cursor-not-allowed'
            : isComplete
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/30'
              : 'bg-accent text-black hover:bg-white hover:text-black'
        }`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isComplete ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {loading ? 'Initializing...' : isComplete ? 'Initialized' : 'Initialize Repository'}
      </button>

      {/* Terminal Progress Overlay Modal */}
      {showProgress && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Initialization progress for ${owner}/${name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6"
          onClick={() => !loading && setShowProgress(false)}
        >
          <div
            className="w-full max-w-2xl bg-zinc-950 border border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 text-left"
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
                  gitranked-init ~ {owner}/{name}
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
                        : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      hasError
                        ? 'bg-amber-400'
                        : isComplete
                          ? 'bg-emerald-400'
                          : 'bg-indigo-400 animate-pulse'
                    }`}
                  />
                  {hasError ? 'ERROR' : isComplete ? 'COMPLETE' : 'RUNNING'}
                </div>
              </div>
            </div>

            {/* Sub-header status bar */}
            <div className="px-5 py-3 bg-black/60 border-b border-zinc-900 flex items-center justify-between text-xs font-mono shrink-0">
              <span className="text-zinc-400 truncate">
                Current Task: <span className="text-zinc-200 font-bold">{statusMessage || 'Initializing...'}</span>
              </span>
              {loading && <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0 ml-2" />}
            </div>

            {/* Terminal Log Output View */}
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
                  badgeColor = 'text-indigo-400 border-indigo-500/30 bg-indigo-950/40';
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
                <span className="text-indigo-400 font-bold">❯</span>
                {loading ? (
                  <span className="animate-pulse text-cyan-400">Ingesting repository history...</span>
                ) : isComplete ? (
                  <span className="text-emerald-400">Initialization finished. View results to analyze.</span>
                ) : (
                  <span className="text-zinc-600">Idle</span>
                )}
                <span className="w-2 h-4 bg-indigo-400 animate-pulse inline-block" />
              </div>

              {/* Dummy element for smooth auto-scroll */}
              <div ref={logsEndRef} />
            </div>

            {/* Modal Bottom Footer */}
            <div className="p-4 bg-zinc-900/80 border-t border-zinc-800 flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-zinc-400 truncate">
                {isComplete ? (
                  <span className="text-emerald-400 font-medium">✓ Events ingested. Ready for analysis.</span>
                ) : hasError ? (
                  <span className="text-amber-400 font-medium">⚠ Initialization encountered errors.</span>
                ) : (
                  <span className="text-zinc-500">Fetching GitHub activity logs</span>
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

export function RepositoryNeedsInit({ owner, name }: { owner: string; name: string }) {
  return (
    <div className="sleek-panel p-8 text-center max-w-2xl mx-auto mt-12 flex flex-col items-center border-2 border-white/10">
      <div className="w-14 h-14 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 border border-indigo-500/20">
        <GitBranch className="w-7 h-7 text-indigo-400" />
      </div>
      <h2 className="text-xl font-bold mb-2 text-white">No activity data yet</h2>
      <p className="text-sm text-zinc-400 leading-relaxed mb-6 max-w-lg">
        This repository is tracked but hasn&apos;t been initialized. Fetch recent commits, pull requests, and reviews from GitHub to start building insights.
      </p>
      <InitializeButton owner={owner} name={name} />
    </div>
  );
}

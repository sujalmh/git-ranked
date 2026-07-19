'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch, Loader2, CheckCircle2, AlertCircle, Download } from 'lucide-react';

export function InitializeButton({ owner, name }: { owner: string; name: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const router = useRouter();

  const handleInitialize = useCallback(async () => {
    setLoading(true);
    setStatus('running');
    setMessage('Connecting to GitHub...');

    try {
      const res = await fetch(`/api/repos/${owner}/${name}/initialize`, {
        method: 'POST',
      });

      if (res.status === 410) {
        setStatus('error');
        setMessage('The GitHub App installation has been removed. Reinstall the app to track this repository.');
        setLoading(false);
        return;
      }

      if (!res.ok && res.status !== 200) {
        const data = await res.json().catch(() => ({}));
        setStatus('error');
        setMessage(data.error || `Failed (${res.status})`);
        setLoading(false);
        return;
      }

      // Check if it was already initialized (JSON response, not stream)
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.alreadyInitialized) {
          setStatus('done');
          setMessage('Already initialized.');
          router.refresh();
          return;
        }
      }

      // Stream NDJSON progress
      if (!res.body) {
        setStatus('error');
        setMessage('No response stream.');
        setLoading(false);
        return;
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
            };

            setMessage(event.message);

            if (event.step === 'init' && event.status === 'complete') {
              if (event.message.includes('failed') || event.message.includes('No recent')) {
                setStatus(event.message.includes('failed') ? 'error' : 'done');
              } else {
                setStatus('done');
              }
              setLoading(false);
              setTimeout(() => router.refresh(), 600);
            } else if (event.status === 'error') {
              setStatus('error');
              setLoading(false);
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Connection failed');
      setLoading(false);
    }
  }, [owner, name, router]);

  if (status === 'done' && loading === false) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-medium">{message}</span>
        </div>
        <p className="text-xs text-zinc-500">Loading insights...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={handleInitialize}
        disabled={loading}
        className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors ${
          loading
            ? 'bg-indigo-600/50 text-indigo-200 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
        }`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {loading ? 'Fetching...' : 'Initialize Repository'}
      </button>

      {loading && message && (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
          {message}
        </div>
      )}

      {status === 'error' && message && (
        <div className="flex items-start gap-2 text-sm text-amber-300 max-w-md text-center">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}

export function RepositoryNeedsInit({ owner, name }: { owner: string; name: string }) {
  return (
    <div className="stark-panel p-8 text-center max-w-2xl mx-auto mt-12 flex flex-col items-center">
      <div className="w-14 h-14 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 border border-indigo-500/20">
        <GitBranch className="w-7 h-7 text-indigo-400" />
      </div>
      <h2 className="text-xl font-bold mb-2">No activity data yet</h2>
      <p className="text-sm text-zinc-400 leading-relaxed mb-6 max-w-lg">
        This repository is tracked but hasn&apos;t been initialized. Fetch recent commits, pull requests, and reviews from GitHub to start building insights.
      </p>
      <InitializeButton owner={owner} name={name} />
    </div>
  );
}

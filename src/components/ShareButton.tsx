'use client';

import React, { useEffect, useState } from 'react';
import { Share2, Copy, Check, Loader2, Link2Off } from 'lucide-react';

function toAbsoluteUrl(value: string | null, origin: string): string | null {
  if (!value) return null;
  try {
    return new URL(value, origin).toString();
  } catch {
    return value;
  }
}

export function ShareButton({
  owner,
  name,
  initialEnabled,
  initialUrl,
  isStatic = false,
}: {
  owner: string;
  name: string;
  initialEnabled: boolean;
  initialUrl: string | null;
  isStatic?: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [origin, setOrigin] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(initialUrl);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const displayUrl = toAbsoluteUrl(url, origin ?? 'http://localhost');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowMenu(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showMenu]);

  async function enableSharing() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${owner}/${name}/share`, { method: 'POST' });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as { url: string; token: string };
      setUrl(data.url);
      setEnabled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to enable sharing');
    } finally {
      setLoading(false);
    }
  }

  async function disableSharing() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${owner}/${name}/share`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setEnabled(false);
      setShowMenu(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke share link');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!displayUrl) return;
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy to clipboard');
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setShowMenu((v) => !v)}
        disabled={loading}
        className={`flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 transition-colors ${
          (enabled || isStatic) ? 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30' : 'bg-white/5 hover:bg-white/10 text-white'
        }`}
        title={(enabled || isStatic) ? 'Shared' : 'Share'}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
      </button>

      {showMenu && (
        <div className="absolute right-0 top-12 z-40 w-96 bg-black border border-white p-5 space-y-4 shadow-[6px_6px_0_0_#fff]" onClick={(e) => e.stopPropagation()}>
          {(enabled || isStatic) && displayUrl ? (
            <>
              <div className="text-sm uppercase tracking-wide text-zinc-500 font-semibold">Public read-only link</div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={displayUrl}
                  className="flex-1 rounded-lg bg-black/30 border border-white/10 px-4 py-2.5 text-sm text-zinc-200 truncate"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={copyLink}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                  title="Copy link"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
              {!isStatic && (
                <>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    Anyone with this link can view the analysis. They cannot trigger analysis or edit the repo.
                  </p>
                  <button
                    onClick={disableSharing}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-white/5 hover:bg-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition-colors"
                  >
                    <Link2Off className="w-4 h-4" />
                    Revoke share link
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <div className="text-sm uppercase tracking-wide text-zinc-500 font-semibold">Share analysis</div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Generate a public, read-only link to these analysis results. Viewers cannot trigger analysis or modify the repository.
              </p>
              <button
                onClick={enableSharing}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Create share link
              </button>
            </>
          )}
          {error && <p className="text-sm text-amber-300">{error}</p>}
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Loader2 } from 'lucide-react';

export function RepoPublicToggle({
  owner,
  name,
  enabled,
}: {
  owner: string;
  name: string;
  enabled: boolean;
}) {
  const [on, setOn] = useState(enabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;

    const next = !on;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${owner}/${name}/public`, {
        method: next ? 'POST' : 'DELETE',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `Failed (${res.status})`);
      }
      setOn(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update visibility');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        title={on ? 'Make private (hide from showcase)' : 'Make public (showcase)'}
        aria-pressed={on}
        className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors border ${
          on
            ? 'bg-accent/15 text-accent border-accent/40 hover:bg-accent/25'
            : 'text-zinc-500 border-white/10 hover:text-zinc-300 hover:border-white/30'
        }`}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Globe className="w-3 h-3" />
        )}
        {on ? 'Public' : 'Private'}
      </button>
      {error && (
        <span className="absolute right-0 top-full mt-1 z-20 whitespace-nowrap text-[10px] text-red-400 bg-black/95 border border-red-500/40 px-2 py-1 rounded">
          {error}
        </span>
      )}
    </div>
  );
}

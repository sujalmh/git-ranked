'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';

export function RemoveRepoButton({ repoId, repoName }: { repoId: number; repoName: string }) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/repos/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId }),
      });

      if (res.ok) {
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to remove repo:', err);
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="relative z-10" onClick={(e) => e.stopPropagation()}>
      {showConfirm ? (
        <div className="flex items-center gap-1.5 bg-red-950/90 border border-red-500/60 rounded px-2 py-1 text-xs shadow-lg">
          <span className="text-red-300 text-[10px] font-bold uppercase tracking-wider">Hide?</span>
          <button
            type="button"
            disabled={loading}
            onClick={handleRemove}
            className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white font-black text-[10px] uppercase rounded transition-colors"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowConfirm(false);
            }}
            className="px-1.5 py-0.5 text-zinc-400 hover:text-white text-[10px] font-bold"
          >
            No
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleRemove}
          title={`Remove ${repoName} from dashboard`}
          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

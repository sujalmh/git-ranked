'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, RefreshCw } from 'lucide-react';

export function AnalyseButton({ 
  owner, 
  name, 
  isReanalyse 
}: { 
  owner: string; 
  name: string; 
  isReanalyse?: boolean 
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAnalyse = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/repos/${owner}/${name}/analyse`, {
        method: 'POST',
      });
      if (res.ok) {
        router.refresh();
      } else {
        console.error('Failed to analyse');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleAnalyse}
      disabled={loading}
      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
        loading 
          ? 'bg-indigo-600/50 text-indigo-200 cursor-not-allowed' 
          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
      }`}
    >
      {loading ? (
        <RefreshCw className="w-4 h-4 animate-spin" />
      ) : isReanalyse ? (
        <RefreshCw className="w-4 h-4" />
      ) : (
        <Brain className="w-4 h-4" />
      )}
      {loading ? 'Crunching data...' : isReanalyse ? 'Re-analyse' : 'Analyse Repository'}
    </button>
  );
}

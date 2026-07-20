'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';

export function AddPublicRepo() {
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    // extract owner/name
    let owner = '';
    let name = '';
    
    // allow format: facebook/react or https://github.com/facebook/react
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/) || repoUrl.match(/^([^/]+)\/([^/]+)$/);
    if (match) {
      owner = match[1];
      name = match[2].replace(/\.git$/, '');
    } else {
      setError('Please enter a valid format, e.g. owner/repo');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/repos/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, name }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add repository');
        setLoading(false);
        return;
      }

      router.push(`/repos/${data.owner}/${data.name}`);
    } catch (err: any) {
      setError('An error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="sleek-panel p-6 mb-8 border border-indigo-500/20 bg-indigo-500/5">
      <h2 className="text-lg font-bold mb-2">Analyze a Public Repository</h2>
      <p className="text-sm text-zinc-400 mb-4">
        Want to analyze a popular open source library? Enter the repository name below.
      </p>
      <form onSubmit={handleAdd} className="flex gap-3 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="e.g. facebook/react"
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !repoUrl.trim()}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center min-w-[120px]"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Analyze'}
        </button>
      </form>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}

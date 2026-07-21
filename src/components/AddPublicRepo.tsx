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
    <div className="sleek-panel p-8 mb-12 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
      <div className="flex-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Analyze a Public Repository</h2>
        <p className="text-base text-zinc-400 font-medium">
          Want to analyze a popular open source library? Enter the repository name below.
        </p>
      </div>
      <form onSubmit={handleAdd} className="flex gap-4 w-full max-w-xl lg:w-auto lg:flex-1">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="e.g. facebook/react"
            className="w-full bg-black border-2 border-white/20 rounded-none pl-12 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-accent transition-colors font-bold"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !repoUrl.trim()}
          className="px-8 py-3 accent-panel text-sm flex items-center justify-center min-w-[140px] uppercase disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ANALYZE'}
        </button>
      </form>
      {error && <p className="text-red-400 text-sm mt-3 font-bold w-full">{error}</p>}
    </div>
  );
}

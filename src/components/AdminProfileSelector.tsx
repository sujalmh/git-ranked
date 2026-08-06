'use client';

import React, { useState } from 'react';
import type { ProfileName } from '@/lib/scoring/types';

interface RepoProfileItem {
  id: number;
  owner: string;
  name: string;
  scoring_profile: ProfileName | null;
}

export type { RepoProfileItem };

export function AdminProfileSelector({ repos }: { repos: RepoProfileItem[] }) {
  const [repoList, setRepoList] = useState(repos);
  const [savingId, setSavingId] = useState<number | null>(null);

  const handleProfileChange = async (repoId: number, profile: ProfileName) => {
    setSavingId(repoId);
    try {
      const res = await fetch('/api/admin/scoring-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId, profile }),
      });
      if (res.ok) {
        setRepoList((prev) =>
          prev.map((r) => (r.id === repoId ? { ...r, scoring_profile: profile } : r))
        );
      }
    } catch (err) {
      console.error('Failed to update profile', err);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-8 rounded-2xl bg-zinc-950 border border-zinc-900">
      <h2 className="text-xl font-semibold mb-4 text-zinc-200">Repository Scoring Profiles</h2>
      <p className="text-xs text-zinc-400 mb-6">Select a preset scoring profile for each repository (balanced, product, infrastructure, open_source, research).</p>
      
      <div className="space-y-3">
        {repoList.map((r) => (
          <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <span className="text-sm font-medium text-zinc-200">{r.owner}/{r.name}</span>
            <select
              value={r.scoring_profile ?? 'balanced'}
              disabled={savingId === r.id}
              onChange={(e) => handleProfileChange(r.id, e.target.value as ProfileName)}
              className="bg-black text-white text-xs border border-zinc-700 rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent"
            >
              <option value="balanced">balanced</option>
              <option value="product">product</option>
              <option value="infrastructure">infrastructure</option>
              <option value="open_source">open_source</option>
              <option value="research">research</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

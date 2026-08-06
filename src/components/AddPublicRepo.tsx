'use client';

import Image from 'next/image';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, Star, GitBranch, Check, X, ArrowRight, Globe } from 'lucide-react';

interface SearchResultItem {
  id: number | string;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  description: string;
  stargazers_count: number;
  forks_count?: number;
  language: string;
  isTracked?: boolean;
}

const FEATURED_REPOS = [
  { name: 'facebook/react', label: 'React' },
  { name: 'vercel/next.js', label: 'Next.js' },
  { name: 'tailwindlabs/tailwindcss', label: 'Tailwind' },
  { name: 'shadcn/ui', label: 'shadcn/ui' },
  { name: 'pgboss/pg-boss', label: 'pg-boss' },
  { name: 'torvalds/linux', label: 'Linux' },
];

export function AddPublicRepo() {
  const [repoQuery, setRepoQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Reset stale search results when the query becomes too short to search.
  const [prevQuery, setPrevQuery] = useState(repoQuery);
  if (prevQuery !== repoQuery) {
    setPrevQuery(repoQuery);
    if (repoQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setShowDropdown(false);
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    const trimmed = repoQuery.trim();
    if (trimmed.length < 2) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setError('');
      try {
        const res = await fetch(`/api/repos/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.items || []);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [repoQuery]);

  const triggerAnalyzeRepo = async (owner: string, name: string) => {
    setIsSubmitting(true);
    setError('');
    setShowDropdown(false);

    try {
      const res = await fetch('/api/repos/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, name }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add repository');
        setIsSubmitting(false);
        return;
      }

      router.push(`/repos/${data.owner}/${data.name}`);
    } catch {
      setError('An error occurred while connecting to repository');
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoQuery.trim() || isSubmitting) return;

    let owner = '';
    let name = '';

    const match = repoQuery.match(/github\.com\/([^/]+)\/([^/]+)/) || repoQuery.match(/^([^/]+)\/([^/]+)$/);
    if (match) {
      owner = match[1];
      name = match[2].replace(/\.git$/, '');
    } else {
      setError('Please select a search result or enter a valid format (e.g. owner/repo)');
      return;
    }

    await triggerAnalyzeRepo(owner, name);
  };

  const handleSelectResult = async (item: SearchResultItem) => {
    setRepoQuery(item.full_name);
    const [owner, name] = item.full_name.split('/');
    await triggerAnalyzeRepo(owner, name);
  };

  const handleSelectFeatured = async (fullName: string) => {
    setRepoQuery(fullName);
    const [owner, name] = fullName.split('/');
    await triggerAnalyzeRepo(owner, name);
  };

  const formatStars = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  return (
    <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-950 space-y-4 relative z-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Globe className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
            PUBLIC REPOSITORIES
          </span>
        </div>
        <span className="text-[11px] text-zinc-500 font-mono">Instant Search</span>
      </div>

      <div>
        <h3 className="text-base font-black text-white uppercase tracking-tight">
          Search Public Repository
        </h3>
        <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
          Search and analyze any public repository on GitHub instantly without installing an app.
        </p>
      </div>

      {/* Search Input Container */}
      <div className="w-full relative" ref={dropdownRef}>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={repoQuery}
              onFocus={() => setShowDropdown(true)}
              onChange={(e) => {
                setRepoQuery(e.target.value);
                setShowDropdown(true);
              }}
              placeholder="Search repository (e.g. facebook/react, vercel/next.js)..."
              className="w-full bg-black border border-zinc-700 rounded-xl pl-11 pr-10 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-accent transition-colors font-bold font-mono"
            />
            {repoQuery && (
              <button
                type="button"
                onClick={() => {
                  setRepoQuery('');
                  setSearchResults([]);
                  setShowDropdown(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !repoQuery.trim()}
            className="px-6 py-3 bg-accent text-black font-black text-xs uppercase tracking-wider hover:bg-[#b8e600] transition-colors flex items-center justify-center gap-2 rounded-xl min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin text-black" />
            ) : (
              <>
                ANALYZE <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Search Dropdown Results */}
        {showDropdown && (repoQuery.trim().length >= 2 || searchResults.length > 0) && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-950 border-2 border-zinc-800 rounded-xl shadow-2xl z-50 max-h-96 overflow-y-auto divide-y divide-zinc-800/60">
            {isSearching ? (
              <div className="p-4 text-center text-zinc-400 text-xs font-mono flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                Searching GitHub public repositories...
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectResult(item)}
                  className="w-full p-3.5 text-left hover:bg-zinc-900 transition-colors flex items-start gap-3.5 group cursor-pointer"
                >
                  {item.owner.avatar_url ? (
                    <Image
                      src={item.owner.avatar_url}
                      alt={item.owner.login}
                      width={28}
                      height={28}
                      className="w-7 h-7 rounded-full border border-zinc-700 shrink-0 mt-0.5"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full border border-zinc-700 bg-zinc-800 shrink-0 mt-0.5 flex items-center justify-center">
                      <GitBranch className="w-4 h-4 text-zinc-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-white group-hover:text-accent transition-colors truncate font-mono">
                        {item.full_name}
                      </span>
                      {item.isTracked && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-accent/10 text-accent border border-accent/30 px-2 py-0.5 shrink-0 flex items-center gap-1 rounded">
                          <Check className="w-3 h-3" /> TRACKED
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5 font-sans">
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-500 font-mono">
                      {item.language && <span>{item.language}</span>}
                      {item.stargazers_count > 0 && (
                        <span className="flex items-center gap-1 text-amber-400/90">
                          <Star className="w-3 h-3 fill-amber-400/90" />
                          {formatStars(item.stargazers_count)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-zinc-500 text-xs font-mono">
                No public repositories found for &quot;{repoQuery}&quot;. Hit Enter to analyze manually.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Featured Repos Quick Picks */}
      <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 mr-1 flex items-center gap-1">
          Popular:
        </span>
        {FEATURED_REPOS.map((featured) => (
          <button
            key={featured.name}
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSelectFeatured(featured.name)}
            className="px-3 py-1 bg-black border border-zinc-800 rounded-lg text-xs font-mono text-zinc-300 hover:border-accent hover:text-accent transition-colors disabled:opacity-50 cursor-pointer"
          >
            {featured.name}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-wider rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
}

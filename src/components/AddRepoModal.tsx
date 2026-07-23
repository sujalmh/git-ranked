'use client';

import React, { useState, useEffect } from 'react';
import {
  Plus,
  X,
  Lock,
  Globe,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  GitBranch,
} from 'lucide-react';
import { AddPublicRepo } from '@/components/AddPublicRepo';
import { GithubIcon } from '@/components/icons/GithubIcon';

export function AddRepoModal({
  installationCount,
  installUrl,
}: {
  installationCount: number;
  installUrl: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Close modal on Escape key press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* Primary "+ Add Repository" Trigger Button on Dashboard */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="px-5 py-2.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(204,255,0,0.15)]"
      >
        <Plus className="w-4 h-4 stroke-[3]" />
        <span>Add Repository</span>
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 overflow-y-auto"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-4xl bg-zinc-950 border-2 border-white/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto text-left animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Header */}
            <div className="p-5 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#ccff00]/10 border border-[#ccff00]/30 text-[#ccff00]">
                  <GitBranch className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">
                    Add Repository To Track
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Import private GitHub repositories or search any public project.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-zinc-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Area: 2-Column Hub */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-black">
              {/* Option A: Private & Personal Repositories */}
              <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-950 flex flex-col justify-between space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        PRIVATE & PERSONAL
                      </span>
                    </div>

                    {installationCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                        <ShieldCheck className="w-3 h-3" /> App Connected
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-black text-white uppercase tracking-tight">
                      Private & Account Repos
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      Connect your GitHub account or org to track private commits, PR reviews, and team insights.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-black border border-zinc-800/80 text-xs font-mono space-y-1.5 text-zinc-300">
                    <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
                      <span className="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-bold text-[9px]">1</span>
                      <span>Click &quot;Connect Private Repositories&quot;</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
                      <span className="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-bold text-[9px]">2</span>
                      <span>Grant access to personal or org repos</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
                      <span className="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-bold text-[9px]">3</span>
                      <span>Auto-syncs to your clean dashboard</span>
                    </div>
                  </div>
                </div>

                <a
                  href={installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-[#ccff00] hover:bg-[#b8e600] text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(204,255,0,0.15)]"
                >
                  <GithubIcon className="w-4 h-4 fill-current" />
                  <span>Connect Private Repositories</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Option B: Public Repository Search */}
              <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-950 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
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
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      Search and analyze any public repository on GitHub instantly without installing an app.
                    </p>
                  </div>
                </div>

                <div className="w-full">
                  <AddPublicRepo />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-zinc-900/80 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
              <span className="font-mono text-[11px]">GitRanked Multi-Repo Analyzer</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs uppercase"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

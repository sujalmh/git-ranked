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

            {/* Modal Content Area: 2-Row Stacked Hub */}
            <div className="p-5 sm:p-6 flex flex-col gap-5 bg-black">
              {/* Row 1: Private & Personal Repositories */}
              <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-950 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                <div className="space-y-2.5 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                      PRIVATE & PERSONAL
                    </span>

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
                    <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                      Connect your GitHub account or org to track private commits, PR reviews, and team insights.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-zinc-400 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-bold text-[9px]">1</span>
                      <span>Click &quot;Connect Private Repositories&quot;</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-bold text-[9px]">2</span>
                      <span>Grant access to personal or org repos</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-bold text-[9px]">3</span>
                      <span>Auto-syncs to your dashboard</span>
                    </div>
                  </div>
                </div>

                <a
                  href={installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto py-3 px-5 rounded-xl bg-[#ccff00] hover:bg-[#b8e600] text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(204,255,0,0.15)] shrink-0 cursor-pointer text-center"
                >
                  <GithubIcon className="w-4 h-4 fill-current" />
                  <span>Connect Private Repositories</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Row 2: Public Repository Search */}
              <AddPublicRepo />
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

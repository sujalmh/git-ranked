'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Brain,
  Crown,
  Zap,
  ShieldCheck,
  Activity,
  CheckCircle2,
  Play,
  ArrowRight,
  Sparkles,
  GitBranch,
  Layers,
} from 'lucide-react';

const STEPS = [
  {
    id: 1,
    badge: 'Step 1',
    title: 'Input Repo Link',
    desc: 'Connect GitHub or paste any public repository URL',
  },
  {
    id: 2,
    badge: 'Step 2',
    title: 'AI Fact Extraction',
    desc: 'Extract facts from pull requests, diffs & reviews',
  },
  {
    id: 3,
    badge: 'Step 3',
    title: 'Leaderboard & Results',
    desc: 'View deterministic 5-dimension scores & profiles',
  },
];

export function AppSnapshots() {
  const [activeStep, setActiveStep] = useState(1);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev % 3) + 1);
    }, 4500);
    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  return (
    <div
      className="w-full"
      onMouseEnter={() => setIsAutoPlaying(false)}
      onMouseLeave={() => setIsAutoPlaying(true)}
    >
      {/* Step Tabs Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {STEPS.map((step) => {
          const isActive = activeStep === step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => {
                setActiveStep(step.id);
                setIsAutoPlaying(false);
              }}
              className={`p-4 text-left rounded-xl border transition-all duration-300 ${
                isActive
                  ? 'bg-zinc-900 border-[#ccff00] shadow-[0_0_20px_rgba(204,255,0,0.15)]'
                  : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 opacity-70 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    isActive
                      ? 'bg-[#ccff00] text-black'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {step.badge}
                </span>
                {isActive && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ccff00] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ccff00]"></span>
                  </span>
                )}
              </div>
              <div className="font-bold text-sm text-white mb-0.5">{step.title}</div>
              <div className="text-xs text-zinc-400 line-clamp-1">{step.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Snapshot Window Frame */}
      <div className="relative rounded-2xl border border-zinc-800 bg-black overflow-hidden shadow-2xl">
        {/* Browser Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>

          <div className="flex items-center gap-2 bg-black/80 border border-zinc-800 px-3 py-1 rounded-md text-xs text-zinc-400 font-mono w-full max-w-sm justify-center">
            <span className="text-zinc-600">https://</span>
            <span className="text-zinc-200">gitranked.com</span>
            <span className="text-zinc-500">
              {activeStep === 1 ? '/analyze' : activeStep === 2 ? '/extract' : '/repos/facebook/react'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
            <span className="hidden sm:inline">LIVE PREVIEW</span>
          </div>
        </div>

        {/* Dynamic Snapshot Viewport */}
        <div className="p-6 md:p-8 min-h-[380px] flex items-center justify-center relative overflow-hidden bg-gradient-to-b from-zinc-950 to-black">
          <AnimatePresence mode="wait">
            {activeStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-xl space-y-6 text-center"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
                  <GitBranch className="w-3.5 h-3.5" /> Quick Analysis Launcher
                </div>

                <h3 className="text-2xl font-bold text-white">Enter any GitHub Repository</h3>
                <p className="text-xs text-zinc-400">Public or connected private repository for instant 5-dimension scoring</p>

                <div className="flex flex-col sm:flex-row gap-2 bg-zinc-900/90 border border-zinc-700/80 p-2 rounded-xl shadow-lg">
                  <div className="flex-1 flex items-center gap-2.5 px-3 py-2 text-zinc-300 font-mono text-sm">
                    <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="text-white font-medium">facebook/react</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveStep(2)}
                    className="px-5 py-2.5 bg-[#ccff00] text-black font-black uppercase text-xs tracking-wider rounded-lg hover:bg-white transition-colors flex items-center justify-center gap-1.5 shrink-0"
                  >
                    Start Analysis <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-center gap-4 text-[11px] text-zinc-500">
                  <span>Try popular:</span>
                  <button type="button" onClick={() => setActiveStep(2)} className="text-indigo-400 hover:underline">vercel/next.js</button>
                  <span>•</span>
                  <button type="button" onClick={() => setActiveStep(2)} className="text-indigo-400 hover:underline">tailwindlabs/tailwindcss</button>
                </div>
              </motion.div>
            )}

            {activeStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-xl space-y-4"
              >
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-indigo-400 animate-pulse" />
                    <span className="font-bold text-sm text-white">AI Fact Extraction Pipeline</span>
                  </div>
                  <span className="text-xs font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                    STATUS: EXTRACTING
                  </span>
                </div>

                <div className="space-y-3 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-zinc-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Ingesting Pull Requests & Commits
                    </span>
                    <span className="text-zinc-500">142 events</span>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-zinc-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> AI Fact Extraction (Scope, Tests, Auth)
                    </span>
                    <span className="text-emerald-400 font-bold">96.4% confidence</span>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-zinc-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Deterministic Layer-2 Soft Cap Engine
                    </span>
                    <span className="text-zinc-400">Complete</span>
                  </div>
                </div>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setActiveStep(3)}
                    className="inline-flex items-center gap-2 text-xs text-indigo-300 hover:text-white font-medium transition-colors"
                  >
                    View Results Dashboard <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )}

            {activeStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full space-y-4"
              >
                {/* Mock Leaderboard Result */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-amber-400" />
                    <span className="font-bold text-sm text-white">facebook/react Leaderboard</span>
                  </div>
                  <span className="text-xs text-zinc-400 font-medium">Profile: Balanced</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* #1 Contributor */}
                  <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-amber-500/30 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                        #1 GOLD
                      </span>
                      <span className="text-xs font-black text-amber-400">Composite: 94</span>
                    </div>
                    <div className="font-bold text-sm text-white mb-2">gaearon</div>
                    <div className="space-y-1.5 text-[11px] text-zinc-400">
                      <div className="flex justify-between"><span>Impact</span><span className="text-white font-bold">92</span></div>
                      <div className="flex justify-between"><span>Quality</span><span className="text-white font-bold">88</span></div>
                      <div className="flex justify-between"><span>Consistency</span><span className="text-white font-bold">96</span></div>
                    </div>
                  </div>

                  {/* #2 Contributor */}
                  <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-700 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded">
                        #2 SILVER
                      </span>
                      <span className="text-xs font-black text-zinc-200">Composite: 88</span>
                    </div>
                    <div className="font-bold text-sm text-white mb-2">acdlite</div>
                    <div className="space-y-1.5 text-[11px] text-zinc-400">
                      <div className="flex justify-between"><span>Impact</span><span className="text-white font-bold">86</span></div>
                      <div className="flex justify-between"><span>Quality</span><span className="text-white font-bold">91</span></div>
                      <div className="flex justify-between"><span>Consistency</span><span className="text-white font-bold">85</span></div>
                    </div>
                  </div>

                  {/* #3 Contributor */}
                  <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-amber-700/30 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-600/10 px-2 py-0.5 rounded border border-amber-600/20">
                        #3 BRONZE
                      </span>
                      <span className="text-xs font-black text-zinc-300">Composite: 82</span>
                    </div>
                    <div className="font-bold text-sm text-white mb-2">sebmarkbage</div>
                    <div className="space-y-1.5 text-[11px] text-zinc-400">
                      <div className="flex justify-between"><span>Impact</span><span className="text-white font-bold">84</span></div>
                      <div className="flex justify-between"><span>Quality</span><span className="text-white font-bold">80</span></div>
                      <div className="flex justify-between"><span>Consistency</span><span className="text-white font-bold">81</span></div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown,
  Activity,
  Sparkles,
  GitBranch,
  ShieldAlert,
  BarChart3,
  Layers,
  ChevronRight,
  Flame,
  Search,
  Users,
  Zap,
  TrendingUp,
  RefreshCw,
  Share2,
} from 'lucide-react';

const STEPS = [
  {
    id: 1,
    badge: 'Step 1',
    title: 'Leaderboard & Podium',
    desc: 'Impact rankings, gold/silver/bronze podium & contributor scores',
  },
  {
    id: 2,
    badge: 'Step 2',
    title: 'Team Health & Activity',
    desc: '5-axis health radar, delivery metrics & real-time activity feed',
  },
  {
    id: 3,
    badge: 'Step 3',
    title: 'Work Areas & AI Insights',
    desc: 'Codebase treemap visualizer, single-owner risks & AI fact summary',
  },
];

export function AppSnapshots() {
  const [activeStep, setActiveStep] = useState(1);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev % 3) + 1);
    }, 6000);
    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  return (
    <div
      className="w-full relative z-10"
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
                  ? 'bg-zinc-900 border-[#ccff00] shadow-[0_0_25px_rgba(204,255,0,0.2)]'
                  : 'bg-zinc-950/80 border-zinc-800/80 hover:border-zinc-700 opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    isActive
                      ? 'bg-[#ccff00] text-black font-extrabold'
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
      <div className="relative rounded-2xl border-2 border-zinc-800 bg-black overflow-hidden shadow-2xl">
        {/* Browser Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>

          <div className="flex items-center gap-2 bg-black/90 border border-zinc-800 px-3 py-1 rounded-md text-xs text-zinc-400 font-mono w-full max-w-sm justify-center">
            <span className="text-zinc-600">https://</span>
            <span className="text-zinc-200">gitranked.com</span>
            <span className="text-[#ccff00] font-semibold">/repos/facebook/react</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded border border-[#ccff00]/30">
              <Sparkles className="w-3 h-3" /> LIVE ANALYSIS
            </span>
          </div>
        </div>

        {/* Global Repo Stats Bar (matching exact header in screenshot) */}
        <div className="p-4 bg-zinc-950/90 border-b border-zinc-800 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-[#ccff00]" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight font-mono">
                  FACEBOOK / REACT
                </h3>
              </div>
              <p className="text-xs text-zinc-400">The library for web and native user interfaces.</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[11px] text-zinc-500 font-mono hidden md:inline">
                Analysis Period: 30 Days
              </span>
              <button
                type="button"
                className="px-2.5 py-1 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-[10px] uppercase rounded hover:text-white flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3 text-[#ccff00]" /> Re-analyse
              </button>
              <button
                type="button"
                className="px-2.5 py-1 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-[10px] uppercase rounded hover:text-white flex items-center gap-1"
              >
                <Share2 className="w-3 h-3" /> Share
              </button>
            </div>
          </div>

          {/* 4 KPI Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
            <div className="p-2.5 rounded-lg border border-zinc-800/90 bg-black/80 flex items-center gap-3">
              <div className="p-2 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-zinc-400 font-bold uppercase">Collaborators</div>
                <div className="text-base font-black text-white">
                  175 <span className="text-[10px] font-normal text-zinc-500">ranked</span>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg border border-zinc-800/90 bg-black/80 flex items-center gap-3">
              <div className="p-2 rounded bg-[#ccff00]/10 border border-[#ccff00]/30 text-[#ccff00]">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-zinc-400 font-bold uppercase">Total Impact</div>
                <div className="text-base font-black text-[#ccff00]">
                  429 <span className="text-[10px] font-normal text-zinc-500">score</span>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg border border-zinc-800/90 bg-black/80 flex items-center gap-3">
              <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-zinc-400 font-bold uppercase">Team Health</div>
                <div className="text-base font-black text-emerald-400">
                  71<span className="text-xs font-normal text-zinc-400">/100</span>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg border border-zinc-800/90 bg-black/80 flex items-center gap-3">
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Flame className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-zinc-400 font-bold uppercase">Active Streaks</div>
                <div className="text-base font-black text-amber-400">
                  9 <span className="text-[10px] font-normal text-zinc-500">streak</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Snapshot Viewport */}
        <div className="p-4 md:p-6 min-h-[430px] flex items-center justify-center relative overflow-hidden bg-black text-left">
          <AnimatePresence mode="wait">
            {/* STEP 1: Leaderboard Podium & Contributor Ranking List */}
            {activeStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full space-y-4"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-[#ccff00]" />
                    <h3 className="text-sm font-black text-white uppercase tracking-tight">
                      Leaderboard <span className="text-zinc-500 font-normal text-xs">Top 3 of 175 — ranked by impact</span>
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded border border-[#ccff00]/30">
                    Team Leaderboard
                  </span>
                </div>

                {/* Podium Cards Row */}
                <div className="grid grid-cols-3 gap-3 items-end">
                  {/* #2 SILVER */}
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-700/80 text-center relative space-y-1">
                    <div className="text-[9px] font-black uppercase bg-zinc-800 text-zinc-300 py-0.5 px-2 rounded-full inline-block">
                      #2 SILVER
                    </div>
                    <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-600 mx-auto flex items-center justify-center font-bold text-xs text-white">
                      gsp
                    </div>
                    <div className="font-bold text-xs text-white truncate">eps1lon</div>
                    <div className="text-[10px] text-zinc-400 font-mono">Generalist</div>
                    <div className="text-sm font-black text-zinc-200">
                      29<span className="text-[10px] text-zinc-500">/100</span>
                    </div>
                  </div>

                  {/* #1 GOLD */}
                  <div className="p-3.5 rounded-xl bg-zinc-950 border-2 border-[#ccff00] shadow-[0_0_20px_rgba(204,255,0,0.2)] text-center relative space-y-1 scale-105">
                    <div className="text-[9px] font-black uppercase bg-[#ccff00] text-black py-0.5 px-2 rounded-full inline-block">
                      👑 #1 GOLD
                    </div>
                    <div className="w-10 h-10 rounded-full bg-[#ccff00]/20 border-2 border-[#ccff00] mx-auto flex items-center justify-center font-black text-sm text-[#ccff00]">
                      heo
                    </div>
                    <div className="font-black text-sm text-white truncate">heoyq</div>
                    <div className="text-[10px] text-[#ccff00] font-mono">Generalist</div>
                    <div className="text-base font-black text-[#ccff00]">
                      38<span className="text-[10px] text-zinc-400">/100</span>
                    </div>
                  </div>

                  {/* #3 BRONZE */}
                  <div className="p-3 rounded-xl bg-zinc-950 border border-amber-800/60 text-center relative space-y-1">
                    <div className="text-[9px] font-black uppercase bg-amber-900/60 text-amber-300 py-0.5 px-2 rounded-full inline-block">
                      #3 BRONZE
                    </div>
                    <div className="w-9 h-9 rounded-full bg-amber-950 border border-amber-700 mx-auto flex items-center justify-center font-bold text-xs text-amber-200">
                      sop
                    </div>
                    <div className="font-bold text-xs text-white truncate">sophiebits</div>
                    <div className="text-[10px] text-zinc-400 font-mono">Developer</div>
                    <div className="text-sm font-black text-amber-400">
                      21<span className="text-[10px] text-zinc-500">/100</span>
                    </div>
                  </div>
                </div>

                {/* Contributor Rankings Table Preview */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden divide-y divide-zinc-800/80">
                  <div className="p-2.5 bg-black/60 flex items-center justify-between text-xs text-zinc-400 font-mono">
                    <div className="flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Search contributors...</span>
                    </div>
                    <span>Rank / Impact</span>
                  </div>

                  <div className="p-2.5 flex items-center justify-between text-xs hover:bg-zinc-900/60">
                    <div className="flex items-center gap-2 font-bold text-white font-mono">
                      <span className="w-5 text-zinc-500 text-[11px]">4</span>
                      <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px]">p</div>
                      <span>potato</span>
                    </div>
                    <span className="font-mono font-bold text-[#ccff00]">20 / 100</span>
                  </div>

                  <div className="p-2.5 flex items-center justify-between text-xs hover:bg-zinc-900/60">
                    <div className="flex items-center gap-2 font-bold text-white font-mono">
                      <span className="w-5 text-zinc-500 text-[11px]">5</span>
                      <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px]">g</div>
                      <span>geoff</span>
                    </div>
                    <span className="font-mono font-bold text-[#ccff00]">17 / 100</span>
                  </div>

                  <div className="p-2.5 flex items-center justify-between text-xs hover:bg-zinc-900/60">
                    <div className="flex items-center gap-2 font-bold text-white font-mono">
                      <span className="w-5 text-zinc-500 text-[11px]">6</span>
                      <div className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[10px]">a</div>
                      <span>analise</span>
                    </div>
                    <span className="font-mono font-bold text-[#ccff00]">13 / 100</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 2: Team Health Radar & Activity Feed */}
            {activeStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Left Column: Team Health Breakdown Card */}
                  <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-black text-white uppercase text-sm">
                        <Activity className="w-4 h-4 text-[#ccff00]" />
                        Team Health
                      </div>
                      <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                        71 / 100 • HEALTHY
                      </span>
                    </div>

                    {/* Radar graphic + Bars */}
                    <div className="grid grid-cols-2 gap-3 pt-1 items-center">
                      {/* Polygon Radar Graphic SVG */}
                      <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full">
                          <polygon points="50,10 90,38 75,90 25,90 10,38" fill="none" stroke="#333" strokeWidth="1.5" />
                          <polygon points="50,25 75,45 65,80 35,80 25,45" fill="none" stroke="#444" strokeWidth="1" />
                          <polygon points="50,15 85,38 70,85 28,82 15,40" fill="rgba(204, 255, 0, 0.25)" stroke="#ccff00" strokeWidth="2" />
                        </svg>
                      </div>

                      {/* Bar Indicators */}
                      <div className="space-y-1.5 font-mono text-[10px]">
                        <div>
                          <div className="flex justify-between text-zinc-400"><span>Delivery</span><span className="text-[#ccff00] font-bold">85</span></div>
                          <div className="w-full bg-zinc-800 h-1 rounded-full"><div className="bg-[#ccff00] h-full rounded-full" style={{ width: '85%' }} /></div>
                        </div>
                        <div>
                          <div className="flex justify-between text-zinc-400"><span>Collab</span><span className="text-cyan-400 font-bold">85</span></div>
                          <div className="w-full bg-zinc-800 h-1 rounded-full"><div className="bg-cyan-400 h-full rounded-full" style={{ width: '85%' }} /></div>
                        </div>
                        <div>
                          <div className="flex justify-between text-zinc-400"><span>Quality</span><span className="text-purple-400 font-bold">90</span></div>
                          <div className="w-full bg-zinc-800 h-1 rounded-full"><div className="bg-purple-400 h-full rounded-full" style={{ width: '90%' }} /></div>
                        </div>
                        <div>
                          <div className="flex justify-between text-zinc-400"><span>Reviews</span><span className="text-amber-400 font-bold">4</span></div>
                          <div className="w-full bg-zinc-800 h-1 rounded-full"><div className="bg-amber-400 h-full rounded-full" style={{ width: '10%' }} /></div>
                        </div>
                        <div>
                          <div className="flex justify-between text-zinc-400"><span>Knowledge</span><span className="text-emerald-400 font-bold">80</span></div>
                          <div className="w-full bg-zinc-800 h-1 rounded-full"><div className="bg-emerald-400 h-full rounded-full" style={{ width: '80%' }} /></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Real-Time Activity Feed */}
                  <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-2.5">
                    <div className="flex items-center justify-between font-black text-white text-xs uppercase">
                      <span className="flex items-center gap-1.5">
                        <BarChart3 className="w-4 h-4 text-cyan-400" /> Activity Feed
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">MOST RECENT FIRST</span>
                    </div>

                    <div className="space-y-2 text-[11px]">
                      <div className="p-2 rounded border border-zinc-800 bg-black/60 flex items-start gap-2">
                        <div className="w-4 h-4 rounded-full bg-[#ccff00]/20 text-[#ccff00] text-[9px] font-bold shrink-0 flex items-center justify-center">s</div>
                        <div className="min-w-0">
                          <span className="font-bold text-white">sammy-code</span> <span className="text-zinc-400">Completed [react-reconciler] Support TestPods experimental array format...</span>
                        </div>
                      </div>

                      <div className="p-2 rounded border border-zinc-800 bg-black/60 flex items-start gap-2">
                        <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-bold shrink-0 flex items-center justify-center">e</div>
                        <div className="min-w-0">
                          <span className="font-bold text-white">eps1lon</span> <span className="text-zinc-400">Approved PR #30285 with approval</span>
                        </div>
                      </div>

                      <div className="p-2 rounded border border-zinc-800 bg-black/60 flex items-start gap-2">
                        <div className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 text-[9px] font-bold shrink-0 flex items-center justify-center">a</div>
                        <div className="min-w-0">
                          <span className="font-bold text-white">acdlite</span> <span className="text-zinc-400">Advanced Apis: Fixed PR: Compile transform for memoized JSX tasks</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 3: Work Areas Treemap & AI Risk Insights */}
            {activeStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full space-y-4"
              >
                {/* Work Areas Treemap Block Visualizer */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white uppercase flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-pink-400" /> Work Areas Treemap
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">HOVER A BLOCK TO SEE CONTRIBUTORS</span>
                  </div>

                  {/* Treemap visual blocks grid matching exact colors in screenshot */}
                  <div className="grid grid-cols-12 gap-1.5 h-28 font-mono text-[10px] text-white font-bold p-1 bg-black rounded border border-zinc-800">
                    <div className="col-span-5 bg-pink-600/60 border border-pink-500/80 p-2 rounded flex flex-col justify-between hover:bg-pink-600 transition-colors">
                      <span>rust compiler</span>
                      <span className="text-[9px] text-pink-200">13%</span>
                    </div>

                    <div className="col-span-3 bg-amber-600/60 border border-amber-500/80 p-2 rounded flex flex-col justify-between hover:bg-amber-600 transition-colors">
                      <span>DevTools</span>
                      <span className="text-[9px] text-amber-200">7%</span>
                    </div>

                    <div className="col-span-4 bg-emerald-600/60 border border-emerald-500/80 p-2 rounded flex flex-col justify-between hover:bg-emerald-600 transition-colors">
                      <span>Flight / Fiber</span>
                      <span className="text-[9px] text-emerald-200">12%</span>
                    </div>
                  </div>
                </div>

                {/* AI Insights & Single Owner Risks */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white uppercase flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#ccff00]" /> AI Insights & Risk Pattern Detection
                    </span>
                    <span className="text-[10px] font-mono text-[#ccff00]">TEAM DISTRIBUTION</span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                    In the second half of July 2026, the React team focused heavily on bug fixes (171) and features (55) across the codebase. Key shipped work included Fast Stack Overflow recovery for errors, nested view/transition animations...
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                    <div className="p-2 rounded border border-amber-500/30 bg-amber-500/10 flex items-start gap-2">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-300 uppercase text-[10px]">Single-Owner Risk</span>
                        <p className="text-zinc-300 text-[10px]">eps1lon: dominant in DOM/Filter bug fixes (15 PRs merged)</p>
                      </div>
                    </div>

                    <div className="p-2 rounded border border-amber-500/30 bg-amber-500/10 flex items-start gap-2">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-300 uppercase text-[10px]">Single-Owner Risk</span>
                        <p className="text-zinc-300 text-[10px]">gaearon: primary contributor to Flight performance & refactoring</p>
                      </div>
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

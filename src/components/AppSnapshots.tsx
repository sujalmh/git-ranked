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
  Flame,
  Search,
  Users,
  Zap,
  TrendingUp,
  RefreshCw,
  Share2,
  Layers,
  UsersRound,
} from 'lucide-react';

const FEATURE_TABS = [
  { id: 1, title: 'Leaderboard & Podium' },
  { id: 2, title: 'Team Health & Activity' },
  { id: 3, title: 'Contributor Profiles' },
  { id: 4, title: 'Work Areas & AI Risks' },
];

export function AppSnapshots() {
  const [activeStep, setActiveStep] = useState(1);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // 2-second continuous slideshow interval (cycles 1 -> 2 -> 3 -> 4 -> 1, paused on hover)
  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev % 4) + 1);
    }, 2000);
    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  return (
    <div
      className="w-full relative z-10"
      onMouseEnter={() => setIsAutoPlaying(false)}
      onMouseLeave={() => setIsAutoPlaying(true)}
    >
      {/* 1. SNAPSHOT SCREEN WINDOW (ABOVE) WITH THIN BOLD WHITE BORDER */}
      <div className="relative rounded-2xl border-2 border-white bg-black overflow-hidden shadow-2xl">
        {/* Browser Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>

          <div className="flex items-center gap-2 bg-black/90 border border-zinc-800 px-3 py-1 rounded-md text-xs text-zinc-400 font-mono w-full max-w-sm justify-center">
            <span className="text-zinc-600">https://</span>
            <span className="text-zinc-200">gitranked.dev</span>
            <span className="text-[#ccff00] font-semibold">/repos/facebook/react</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded border border-[#ccff00]/30">
              <Sparkles className="w-3 h-3" /> LIVE APP
            </span>
          </div>
        </div>

        {/* Global Repo Header & Stats Strip */}
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

        {/* Dynamic Viewport with FIXED HEIGHT (460px) to completely eliminate height shift */}
        <div className="p-4 md:p-6 h-[460px] overflow-y-auto bg-black text-left">
          <AnimatePresence mode="wait">
            {/* STEP 1: Leaderboard Podium & Contributor Rankings */}
            {activeStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
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
                  <div className="p-2 bg-black/60 flex items-center justify-between text-xs text-zinc-400 font-mono">
                    <div className="flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Search contributors...</span>
                    </div>
                    <span>Rank / Impact</span>
                  </div>

                  <div className="p-2 flex items-center justify-between text-xs hover:bg-zinc-900/60">
                    <div className="flex items-center gap-2 font-bold text-white font-mono">
                      <span className="w-5 text-zinc-500 text-[11px]">4</span>
                      <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px]">p</div>
                      <span>potato</span>
                    </div>
                    <span className="font-mono font-bold text-[#ccff00]">20 / 100</span>
                  </div>

                  <div className="p-2 flex items-center justify-between text-xs hover:bg-zinc-900/60">
                    <div className="flex items-center gap-2 font-bold text-white font-mono">
                      <span className="w-5 text-zinc-500 text-[11px]">5</span>
                      <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px]">g</div>
                      <span>geoff</span>
                    </div>
                    <span className="font-mono font-bold text-[#ccff00]">17 / 100</span>
                  </div>

                  <div className="p-2 flex items-center justify-between text-xs hover:bg-zinc-900/60">
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs"
              >
                {/* Left Column: Team Health Breakdown Card */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-black text-white uppercase text-sm">
                      <Activity className="w-4 h-4 text-[#ccff00]" />
                      Team Health
                    </div>
                    <span className="text-[11px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                      71 / 100 • HEALTHY
                    </span>
                  </div>

                  {/* Radar graphic + Bars */}
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                      <svg viewBox="0 0 100 100" className="w-full h-full">
                        <polygon points="50,10 90,38 75,90 25,90 10,38" fill="none" stroke="#333" strokeWidth="1.5" />
                        <polygon points="50,25 75,45 65,80 35,80 25,45" fill="none" stroke="#444" strokeWidth="1" />
                        <polygon points="50,15 85,38 70,85 28,82 15,40" fill="rgba(204, 255, 0, 0.25)" stroke="#ccff00" strokeWidth="2" />
                      </svg>
                    </div>

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
              </motion.div>
            )}

            {/* STEP 3: Contributor Profiles */}
            {activeStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <div className="flex items-center gap-2">
                    <UsersRound className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-black text-white uppercase tracking-tight">
                      Contributor Profiles <span className="text-zinc-500 font-normal text-xs">Top 3 of 175</span>
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400">Stat tiles + AI work summary</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {/* Contributor Card 1 */}
                  <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#ccff00]/20 text-[#ccff00] font-black flex items-center justify-center text-xs">h</div>
                        <div>
                          <div className="font-bold text-white text-xs">heoyq</div>
                          <div className="text-[9px] text-zinc-500 font-mono uppercase">T10 - BUILDER</div>
                        </div>
                      </div>
                      <span className="text-xs font-black text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded border border-[#ccff00]/30">38/100</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                      Shipped multiple features and improvements for React DevTools, including Chrome DevTools E2E coverage...
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <span className="text-[9px] px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono">DevTools</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono">Testing</span>
                    </div>
                  </div>

                  {/* Contributor Card 2 */}
                  <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 font-black flex items-center justify-center text-xs">e</div>
                        <div>
                          <div className="font-bold text-white text-xs">eps1lon</div>
                          <div className="text-[9px] text-zinc-500 font-mono uppercase">T10 - BUILDER</div>
                        </div>
                      </div>
                      <span className="text-xs font-black text-zinc-200 bg-zinc-800 px-2 py-0.5 rounded">29/100</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                      Focused on shipping bug fixes and performance improvements across React DOM, Fiber, and Flight...
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <span className="text-[9px] px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono">Bug Fixes</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono">Docs</span>
                    </div>
                  </div>

                  {/* Contributor Card 3 */}
                  <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 font-black flex items-center justify-center text-xs">s</div>
                        <div>
                          <div className="font-bold text-white text-xs">sophiebits</div>
                          <div className="text-[9px] text-zinc-500 font-mono uppercase">T10 - BUILDER</div>
                        </div>
                      </div>
                      <span className="text-xs font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">21/100</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                      Delivered critical bug fixes to React Fiber reconciler and Fast Refresh, ensuring correct component behavior...
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <span className="text-[9px] px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono">Fiber Core</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono">Fast Refresh</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 4: Work Areas Treemap & AI Risk Insights */}
            {activeStep === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Work Areas Treemap Visualizer */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white uppercase flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-pink-400" /> Work Areas Treemap
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">CODE MODULES</span>
                  </div>

                  <div className="grid grid-cols-12 gap-1.5 h-24 font-mono text-[10px] text-white font-bold p-1 bg-black rounded border border-zinc-800">
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
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white uppercase flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#ccff00]" /> AI Risk Detection
                    </span>
                    <span className="text-[10px] font-mono text-[#ccff00]">DISTRIBUTION PATTERNS</span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed font-sans line-clamp-2">
                    In the second half of July 2026, the React team focused heavily on bug fixes (171) and features (55) across the codebase. Key shipped work included Fast Stack Overflow recovery...
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                    <div className="p-2 rounded border border-amber-500/30 bg-amber-500/10 flex items-start gap-2">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-300 uppercase text-[10px]">Single-Owner Risk</span>
                        <p className="text-zinc-300 text-[10px] truncate">eps1lon: dominant in DOM/Filter bug fixes</p>
                      </div>
                    </div>

                    <div className="p-2 rounded border border-amber-500/30 bg-amber-500/10 flex items-start gap-2">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-300 uppercase text-[10px]">Single-Owner Risk</span>
                        <p className="text-zinc-300 text-[10px] truncate">gaearon: primary contributor to Flight performance</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 2. FEATURE TABS SELECTOR (BELOW SNAPSHOT SCREEN - CLEAN TITLE-ONLY BUTTONS) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        {FEATURE_TABS.map((tab) => {
          const isActive = activeStep === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveStep(tab.id);
                setIsAutoPlaying(false);
              }}
              className={`p-3 text-center rounded-xl border transition-all duration-300 ${
                isActive
                  ? 'bg-zinc-900 border-[#ccff00] text-white shadow-[0_0_20px_rgba(204,255,0,0.15)] font-bold'
                  : 'bg-zinc-950/80 border-zinc-800/80 hover:border-zinc-700 text-zinc-400 opacity-75 hover:opacity-100 font-semibold'
              }`}
            >
              <div className="flex items-center justify-center gap-2 text-xs">
                <span>{tab.title}</span>
                {isActive && (
                  <span className="flex h-2 w-2 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ccff00] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ccff00]"></span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

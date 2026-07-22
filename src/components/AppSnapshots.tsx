'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Brain,
  Crown,
  Zap,
  Activity,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  GitBranch,
  AlertTriangle,
  Flame,
  ShieldAlert,
  BarChart3,
  Layers,
  ChevronRight,
} from 'lucide-react';

const STEPS = [
  {
    id: 1,
    badge: 'Step 1',
    title: 'Repo Hub & Analysis',
    desc: 'Connect organization repos or analyze any public GitHub repo',
  },
  {
    id: 2,
    badge: 'Step 2',
    title: 'AI Fact Extraction',
    desc: 'Ingest PRs, reviews & diffs into 5-dimension health scores',
  },
  {
    id: 3,
    badge: 'Step 3',
    title: 'Leaderboard & Profiles',
    desc: 'Objective impact rankings, AI role detection & PR insights',
  },
];

export function AppSnapshots() {
  const [activeStep, setActiveStep] = useState(1);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev % 3) + 1);
    }, 5500);
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
            <span className="text-[#ccff00] font-semibold">
              {activeStep === 1 ? '/dashboard' : activeStep === 2 ? '/repos/sujalmh/restaurant-bot' : '/repos/sujalmh/restaurant-bot/leaderboard'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded border border-[#ccff00]/30">
              <Sparkles className="w-3 h-3" /> LIVE APP
            </span>
          </div>
        </div>

        {/* Dynamic Snapshot Viewport */}
        <div className="p-5 md:p-6 min-h-[420px] flex items-center justify-center relative overflow-hidden bg-black text-left">
          <AnimatePresence mode="wait">
            {/* STEP 1: Repository Dashboard View (Matching Image 2) */}
            {activeStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full space-y-5"
              >
                {/* Header Title */}
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-[#ccff00]" />
                      <h3 className="text-xl font-black text-white uppercase tracking-tight">Your Repositories</h3>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">Track activity, compute scores, and generate AI insights.</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setActiveStep(2)}
                    className="px-3.5 py-1.5 bg-[#ccff00] text-black font-extrabold text-xs uppercase tracking-wider rounded hover:bg-white transition-colors flex items-center gap-1 shrink-0"
                  >
                    Manage Installations
                  </button>
                </div>

                {/* Search Public Repo Panel */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/90 space-y-2">
                  <div className="text-xs font-black text-white uppercase tracking-wider">Analyze a Public Repository</div>
                  <p className="text-[11px] text-zinc-400">Want to analyze a popular open source library? Enter repository name below.</p>
                  <div className="flex gap-2 pt-1">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-black border border-zinc-700 rounded text-xs text-zinc-300 font-mono">
                      <Search className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-white font-medium">facebook/react</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveStep(2)}
                      className="px-4 py-2 bg-[#ccff00] text-black font-black uppercase text-xs tracking-wider rounded hover:bg-white transition-colors"
                    >
                      Analyze
                    </button>
                  </div>
                </div>

                {/* Repo Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Card 1 */}
                  <div 
                    onClick={() => setActiveStep(2)}
                    className="p-3.5 rounded-xl border-2 border-[#ccff00]/60 bg-zinc-950 hover:border-[#ccff00] cursor-pointer transition-all space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                        <GitBranch className="w-3.5 h-3.5 text-[#ccff00]" />
                        <span>sujalmh / restaurant-bot</span>
                      </div>
                      <span className="px-2 py-0.5 bg-[#ccff00]/20 text-[#ccff00] border border-[#ccff00]/40 text-[10px] font-black rounded">
                        57 HEALTH
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">BRANCH: MAIN • 31 EVENTS</div>
                    <div className="flex items-center justify-end text-[11px] font-extrabold text-[#ccff00] uppercase pt-1">
                      View Insights <ArrowRight className="w-3 h-3 ml-1" />
                    </div>
                  </div>

                  {/* Card 2 */}
                  <div 
                    onClick={() => setActiveStep(2)}
                    className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/70 hover:border-zinc-700 cursor-pointer transition-all space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-zinc-300 truncate max-w-[140px]">
                        <GitBranch className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="truncate">sujalmh / AI-Surveillance</span>
                      </div>
                      <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-[10px] font-bold rounded">
                        SET UP
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">BRANCH: MAIN • ADDED 7/22</div>
                    <div className="flex items-center justify-end text-[11px] font-bold text-zinc-400 uppercase pt-1">
                      Set Up <ChevronRight className="w-3 h-3 ml-1" />
                    </div>
                  </div>

                  {/* Card 3 */}
                  <div 
                    onClick={() => setActiveStep(2)}
                    className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/70 hover:border-zinc-700 cursor-pointer transition-all space-y-2 hidden sm:block"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-zinc-300">
                        <GitBranch className="w-3.5 h-3.5 text-zinc-500" />
                        <span>sujalmh / f1</span>
                      </div>
                      <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-[10px] font-bold rounded">
                        SET UP
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">BRANCH: MAIN • ADDED 7/22</div>
                    <div className="flex items-center justify-end text-[11px] font-bold text-zinc-400 uppercase pt-1">
                      Set Up <ChevronRight className="w-3 h-3 ml-1" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 2: AI Fact Extraction & Health Overview (Matching Image 3 Top Section) */}
            {activeStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full space-y-4"
              >
                {/* Repo Banner */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-zinc-800 pb-3 gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-[#ccff00]" />
                      <h3 className="text-lg font-black text-white uppercase tracking-tight">SUJALMH / RESTAURANT-BOT</h3>
                    </div>
                    <p className="text-xs text-zinc-400">AI engineering intelligence: understanding PR impact & bottlenecks</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setActiveStep(3)}
                    className="px-3 py-1 bg-[#ccff00] text-black text-xs font-black uppercase rounded hover:bg-white transition-colors"
                  >
                    Leaderboard →
                  </button>
                </div>

                {/* Top Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-950">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase">Collaborators</div>
                    <div className="text-lg font-black text-white">2 <span className="text-[10px] font-normal text-zinc-500">ranked</span></div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-950">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase">Total Impact</div>
                    <div className="text-lg font-black text-[#ccff00]">82 <span className="text-[10px] font-normal text-zinc-500">points</span></div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-950">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase">Team Health</div>
                    <div className="text-lg font-black text-emerald-400">57<span className="text-xs font-normal text-zinc-400">/100</span></div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-950">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase">Active Streaks</div>
                    <div className="text-lg font-black text-amber-400">0 <span className="text-[10px] font-normal text-zinc-500">active</span></div>
                  </div>
                </div>

                {/* Team Health & AI Findings Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Left Column: AI Extraction & Health Breakdown */}
                  <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/80 space-y-3">
                    <div className="flex items-center justify-between font-bold text-zinc-200">
                      <span className="flex items-center gap-1.5 text-xs text-white uppercase font-black">
                        <Brain className="w-4 h-4 text-indigo-400 animate-pulse" /> Team Health Breakdown
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        HEALTHY
                      </span>
                    </div>

                    <div className="space-y-2 font-mono text-[11px]">
                      <div>
                        <div className="flex justify-between text-zinc-400 mb-0.5"><span>Delivery</span><span className="text-white font-bold">87%</span></div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden"><div className="bg-[#ccff00] h-full" style={{ width: '87%' }} /></div>
                      </div>
                      <div>
                        <div className="flex justify-between text-zinc-400 mb-0.5"><span>Quality</span><span className="text-white font-bold">75%</span></div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden"><div className="bg-emerald-400 h-full" style={{ width: '75%' }} /></div>
                      </div>
                      <div>
                        <div className="flex justify-between text-zinc-400 mb-0.5"><span>Collaboration</span><span className="text-white font-bold">65%</span></div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden"><div className="bg-indigo-400 h-full" style={{ width: '65%' }} /></div>
                      </div>
                      <div>
                        <div className="flex justify-between text-zinc-400 mb-0.5"><span>Knowledge Share</span><span className="text-white font-bold">53%</span></div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden"><div className="bg-amber-400 h-full" style={{ width: '53%' }} /></div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: AI Findings Stream */}
                  <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/80 space-y-2.5">
                    <div className="flex items-center justify-between font-black text-white text-xs uppercase">
                      <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-[#ccff00]" /> AI Risk & Impact Alerts</span>
                    </div>

                    <div className="space-y-2 text-[11px]">
                      <div className="p-2 rounded border border-amber-500/30 bg-amber-500/5 flex items-start gap-2">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-amber-300 uppercase text-[10px]">Single Owner Risk</span>
                          <p className="text-zinc-400 line-clamp-1">UI Shared components owned strictly by sujalmh</p>
                        </div>
                      </div>

                      <div className="p-2 rounded border border-indigo-500/30 bg-indigo-500/5 flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-indigo-300 uppercase text-[10px]">Architecture Upgrade</span>
                          <p className="text-zinc-400 line-clamp-1">RBAC models & auth middleware added by sujalnkumar</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 3: Leaderboard & Contributor Profiles (Matching Image 3 Middle Section) */}
            {activeStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full space-y-4"
              >
                {/* Leaderboard Header */}
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-[#ccff00]" />
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">Leaderboard — top 2 of 2</h3>
                  </div>
                  <span className="text-xs text-zinc-400 font-mono">Ranked by Composite Impact</span>
                </div>

                {/* Podium Cards Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* #1 Gold Contributor Card */}
                  <div className="p-4 rounded-xl bg-zinc-950 border-2 border-[#ccff00] shadow-[0_0_15px_rgba(204,255,0,0.15)] flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-0 right-0 px-3 py-1 bg-[#ccff00] text-black font-black text-[10px] uppercase">
                      #1 GOLD MVP
                    </div>
                    <div>
                      <div className="text-xs text-zinc-400 font-bold mb-1">ARCHITECTURAL LEAD</div>
                      <div className="text-xl font-black text-white mb-2">sujalnkumar</div>
                      <div className="text-xs font-black text-[#ccff00] mb-3">Composite Score: 45 / 100</div>
                    </div>
                    <div className="space-y-1 text-[11px] border-t border-zinc-800 pt-2 text-zinc-300">
                      <div className="flex justify-between"><span>Impact Score:</span><span className="font-bold text-white">48</span></div>
                      <div className="flex justify-between"><span>Quality & Tests:</span><span className="font-bold text-white">42</span></div>
                      <div className="flex justify-between"><span>Collaboration:</span><span className="font-bold text-white">45</span></div>
                    </div>
                  </div>

                  {/* #2 Silver Contributor Card */}
                  <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-700 flex flex-col justify-between relative">
                    <div className="absolute top-0 right-0 px-3 py-1 bg-zinc-800 text-zinc-300 font-bold text-[10px] uppercase">
                      #2 SILVER
                    </div>
                    <div>
                      <div className="text-xs text-zinc-400 font-bold mb-1">FULL-STACK MAINTAINER</div>
                      <div className="text-xl font-black text-white mb-2">sujalmh</div>
                      <div className="text-xs font-black text-zinc-300 mb-3">Composite Score: 37 / 100</div>
                    </div>
                    <div className="space-y-1 text-[11px] border-t border-zinc-800 pt-2 text-zinc-300">
                      <div className="flex justify-between"><span>Impact Score:</span><span className="font-bold text-white">36</span></div>
                      <div className="flex justify-between"><span>Quality & Tests:</span><span className="font-bold text-white">40</span></div>
                      <div className="flex justify-between"><span>Collaboration:</span><span className="font-bold text-white">35</span></div>
                    </div>
                  </div>
                </div>

                {/* AI Contributor Narrative Profile Snippet */}
                <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950 text-xs space-y-2">
                  <div className="flex items-center justify-between font-bold text-zinc-300">
                    <span className="flex items-center gap-1.5 text-white font-black uppercase text-[11px]">
                      <Brain className="w-3.5 h-3.5 text-[#ccff00]" /> AI Role & Impact Summary
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">TOP CONTRIBUTOR PROFILE</span>
                  </div>
                  <p className="text-zinc-400 text-[11px] leading-relaxed line-clamp-2">
                    &quot;sujalnkumar drove main feature and infrastructure work by opening and keeping review-split pull requests that added RBAC models, order schemas, and authentication middleware...&quot;
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-mono rounded">RBAC</span>
                    <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-mono rounded">Data Migration</span>
                    <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-mono rounded">Framework</span>
                    <span className="px-2 py-0.5 bg-[#ccff00]/10 border border-[#ccff00]/30 text-[#ccff00] text-[10px] font-mono rounded">UI/UX</span>
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

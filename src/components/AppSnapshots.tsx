'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  GitBranch,
  RefreshCw,
  Share2,
} from 'lucide-react';
import { EvidenceProvider } from '@/components/evidence';
import {
  StatsStrip,
  Leaderboard,
  HealthCard,
  ContributorProfiles,
  WorkAreasHeatmap,
  AiInsights,
  assignIdentity,
} from '@/components/ranked';
import { ActivityFeed } from '@/components/ActivityFeed';
import type { ContributorInsight } from '@/lib/contributor-insights';

const REACT_MOCK_CONTRIBUTORS: ContributorInsight[] = [
  {
    id: 1,
    username: 'heoyq',
    avatarUrl: 'https://github.com/heoyq.png',
    score: {
      total: 38,
      breakdown: { featureDelivery: 10, codeQuality: 9, reviews: 8, collaboration: 6, consistency: 5 },
    },
    impactScore: 38,
    commits: 42,
    prsOpened: 15,
    prsMerged: 12,
    reviews: 18,
    issues: 5,
    releases: 1,
    fixes: 8,
    changedLines: 3200,
    additions: 2100,
    deletions: 1100,
    lastActive: new Date(),
    role: 'T10 - BUILDER',
    summary: [
      'Shipped multiple features and improvements for React DevTools, including Chrome DevTools E2E coverage, parent stack tool, and various infrastructure enhancements.',
    ],
    categories: [
      { label: 'DevTools', detail: 'Chrome DevTools & Extension', value: 15 },
      { label: 'Feature', detail: 'Core Features', value: 10 },
      { label: 'Infrastructure', detail: 'Build & CI', value: 8 },
      { label: 'Testing', detail: 'Testing & QA', value: 5 },
    ],
    highlights: ['Shipped React DevTools E2E test coverage', 'Main contributor to DevTools extension reconnects'],
    events: [],
    velocity: [5, 8, 12, 15, 10, 14, 18],
    velocityLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    currentStreak: 12,
    longestStreak: 24,
    collaborationScore: 88,
    workDistribution: { DevTools: 15, Feature: 10, Infrastructure: 8, Testing: 5 },
    reviewedByCount: 8,
    reviewedOthersCount: 14,
    collaborators: ['eps1lon', 'sophiebits', 'gaearon'],
  },
  {
    id: 2,
    username: 'eps1lon',
    avatarUrl: 'https://github.com/eps1lon.png',
    score: {
      total: 29,
      breakdown: { featureDelivery: 8, codeQuality: 7, reviews: 6, collaboration: 5, consistency: 3 },
    },
    impactScore: 29,
    commits: 34,
    prsOpened: 12,
    prsMerged: 10,
    reviews: 14,
    issues: 3,
    releases: 0,
    fixes: 15,
    changedLines: 2400,
    additions: 1500,
    deletions: 900,
    lastActive: new Date(),
    role: 'T10 - BUILDER',
    summary: [
      "Focused on shipping bug fixes and performance improvements across React's DOM, Fiber, and Flight/App subsystems, while also contributing documentation and testing.",
    ],
    categories: [
      { label: 'Bug Fixes', detail: 'React DOM & Fiber Fixes', value: 15 },
      { label: 'Testing', detail: 'Testing & QA', value: 8 },
      { label: 'Documentation', detail: 'Docs', value: 6 },
    ],
    highlights: ['Dominant in DOM/Filter bug fixes (15 PRs merged)', 'Single-owner risk on Fragment cooling'],
    events: [],
    velocity: [4, 6, 8, 10, 8, 11, 14],
    velocityLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    currentStreak: 8,
    longestStreak: 18,
    collaborationScore: 82,
    workDistribution: { 'Bug Fixes': 15, Testing: 8, Documentation: 6 },
    reviewedByCount: 6,
    reviewedOthersCount: 10,
    collaborators: ['heoyq', 'gaearon'],
  },
  {
    id: 3,
    username: 'sophiebits',
    avatarUrl: 'https://github.com/sophiebits.png',
    score: {
      total: 21,
      breakdown: { featureDelivery: 5, codeQuality: 5, reviews: 4, collaboration: 4, consistency: 3 },
    },
    impactScore: 21,
    commits: 22,
    prsOpened: 8,
    prsMerged: 7,
    reviews: 9,
    issues: 2,
    releases: 0,
    fixes: 6,
    changedLines: 1800,
    additions: 1100,
    deletions: 700,
    lastActive: new Date(),
    role: 'T10 - BUILDER',
    summary: [
      "Sophiebits delivered a focused set of critical bug fixes to React's Fiber reconciler and Fast Refresh, ensuring correct behavior for component remounting...",
    ],
    categories: [
      { label: 'Fiber Reconciler', detail: 'Fiber Core', value: 9 },
      { label: 'Fast Refresh', detail: 'HMR & Refresh', value: 8 },
      { label: 'Error Mode', detail: 'Error Recovery', value: 4 },
    ],
    highlights: ['Delivered critical bug fixes to Fiber reconciler'],
    events: [],
    velocity: [2, 4, 6, 7, 5, 8, 9],
    velocityLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    currentStreak: 5,
    longestStreak: 12,
    collaborationScore: 75,
    workDistribution: { 'Fiber Reconciler': 9, 'Fast Refresh': 8, 'Error Mode': 4 },
    reviewedByCount: 4,
    reviewedOthersCount: 7,
    collaborators: ['heoyq', 'eps1lon'],
  },
  {
    id: 4,
    username: 'potato',
    avatarUrl: 'https://github.com/potato.png',
    score: { total: 20, breakdown: { featureDelivery: 5, codeQuality: 5, reviews: 4, collaboration: 3, consistency: 3 } },
    impactScore: 20,
    commits: 18,
    prsOpened: 6,
    prsMerged: 5,
    reviews: 7,
    issues: 1,
    releases: 0,
    fixes: 4,
    changedLines: 1200,
    additions: 800,
    deletions: 400,
    lastActive: new Date(),
    role: 'T10 - BUILDER',
    summary: ['Shipped compiler bailouts with Todo on using and avoid using declarations.'],
    categories: [{ label: 'Compiler', detail: 'React Compiler', value: 8 }],
    highlights: [],
    events: [],
    velocity: [2, 3, 4, 5],
    velocityLabels: ['W1', 'W2', 'W3', 'W4'],
    currentStreak: 4,
    longestStreak: 10,
    collaborationScore: 70,
    workDistribution: { Compiler: 8 },
    reviewedByCount: 3,
    reviewedOthersCount: 5,
    collaborators: ['geoff'],
  },
  {
    id: 5,
    username: 'geoff',
    avatarUrl: 'https://github.com/geoff.png',
    score: { total: 17, breakdown: { featureDelivery: 4, codeQuality: 4, reviews: 4, collaboration: 3, consistency: 2 } },
    impactScore: 17,
    commits: 15,
    prsOpened: 5,
    prsMerged: 4,
    reviews: 6,
    issues: 1,
    releases: 0,
    fixes: 3,
    changedLines: 950,
    additions: 600,
    deletions: 350,
    lastActive: new Date(),
    role: 'T10 - BUILDER',
    summary: ['Shipped [TightReplay] Performance improvements when decoding...'],
    categories: [{ label: 'Performance', detail: 'TightReplay', value: 6 }],
    highlights: [],
    events: [],
    velocity: [1, 2, 4, 5],
    velocityLabels: ['W1', 'W2', 'W3', 'W4'],
    currentStreak: 3,
    longestStreak: 8,
    collaborationScore: 68,
    workDistribution: { Performance: 6 },
    reviewedByCount: 2,
    reviewedOthersCount: 4,
    collaborators: ['potato'],
  },
  {
    id: 6,
    username: 'analise',
    avatarUrl: 'https://github.com/analise.png',
    score: { total: 13, breakdown: { featureDelivery: 3, codeQuality: 3, reviews: 3, collaboration: 2, consistency: 2 } },
    impactScore: 13,
    commits: 12,
    prsOpened: 4,
    prsMerged: 3,
    reviews: 4,
    issues: 0,
    releases: 0,
    fixes: 2,
    changedLines: 700,
    additions: 450,
    deletions: 250,
    lastActive: new Date(),
    role: 'T10 - BUILDER',
    summary: ['Shipped [Jest] Normalize Windows paths in the Jest preprocessor.'],
    categories: [{ label: 'Testing', detail: 'Jest', value: 4 }],
    highlights: [],
    events: [],
    velocity: [1, 2, 3, 4],
    velocityLabels: ['W1', 'W2', 'W3', 'W4'],
    currentStreak: 2,
    longestStreak: 6,
    collaborationScore: 65,
    workDistribution: { Testing: 4 },
    reviewedByCount: 2,
    reviewedOthersCount: 3,
    collaborators: ['jackpope'],
  },
];

const REACT_MOCK_HEALTH_METRICS = {
  overallScore: 71,
  delivery: 85,
  collaboration: 85,
  codeQuality: 90,
  reviewHealth: 4,
  knowledgeDistribution: 80,
};

const REACT_MOCK_ACTIVITY_FEED = [
  {
    id: '1',
    type: 'commit',
    username: 'sammy-code',
    repo: 'facebook/react',
    title: 'Completed [react-reconciler] Support TestPods experimental array format for memoization',
    timestamp: 'Today',
  },
  {
    id: '2',
    type: 'review',
    username: 'eps1lon',
    repo: 'facebook/react',
    title: 'Approved PR #30285 with approval',
    timestamp: 'Today',
  },
  {
    id: '3',
    type: 'pull_request',
    username: 'acdlite',
    repo: 'facebook/react',
    title: 'Advanced Apis: Fixed PR: Compile transform for memoized JSX tasks',
    timestamp: 'Today',
  },
  {
    id: '4',
    type: 'review',
    username: 'gaearon',
    repo: 'facebook/react',
    title: 'Reviewed PR #29382 with approval',
    timestamp: 'Today',
  },
  {
    id: '5',
    type: 'commit',
    username: 'acdlite',
    repo: 'facebook/react',
    title: 'Completed: A lower Actor mutation vs render-side condition in Suspense hydration',
    timestamp: 'Today',
  },
];

const REACT_MOCK_HEATMAP_CONTRIBUTORS = REACT_MOCK_CONTRIBUTORS.map((c) => ({
  id: c.id,
  username: c.username,
  avatarUrl: c.avatarUrl,
  areas: c.categories.map((cat) => ({ label: cat.label, value: cat.value })),
}));

const REACT_MOCK_OVERVIEW =
  'In the second half of July 2026, the React team focused heavily on bug fixes (171) and features (55) across the codebase. Key shipped work included Fast Stack Overflow recovery for errors, nested view/transition animations...';

const REACT_MOCK_SUMMARY = {
  overview: REACT_MOCK_OVERVIEW,
  shipped_highlights: [
    'Fast Stack Overflow recovery for errors',
    'Nested view/transition animations support',
    'Chrome DevTools E2E coverage & parent stack tool',
  ],
  risks: [
    'eps1lon: dominant in DOM/Filter bug fixes (15 PRs merged), suggesting ownership of Fragment cooling and humanizing.',
    'gaearon: primary contributor to Flight performance and refactoring (4 PRs opened), indicating ownership of Flight deduplication and inline data channels.',
    'heoyq: main contributor to DevTools (5 PRs opened), covering Bridge, Store, and extension reconnects.',
  ],
  work_distribution: [
    { category: 'Bug Fixes', count: 171 },
    { category: 'Features', count: 55 },
    { category: 'Performance', count: 28 },
    { category: 'Infrastructure', count: 18 },
  ],
};

const REACT_MOCK_TEAM_INSIGHTS = {
  single_owner_modules: [
    'eps1lon: dominant in DOM/Filter bug fixes (15 PRs merged), suggesting ownership of Fragment cooling and humanizing.',
    'gaearon: primary contributor to Flight performance and refactoring (4 PRs opened), indicating ownership of Flight deduplication and inline data channels.',
    'heoyq: main contributor to DevTools (5 PRs opened), covering Bridge, Store, and extension reconnects.',
  ],
  review_bottlenecks: [],
  collaboration_patterns: [],
};

const FEATURE_TABS = [
  {
    id: 1,
    title: 'Leaderboard & Podium',
    desc: 'Impact rankings, gold/silver/bronze podium & contributor scores',
  },
  {
    id: 2,
    title: 'Team Health & Activity',
    desc: '5-axis health radar, delivery metrics & activity feed',
  },
  {
    id: 3,
    title: 'Contributor Profiles',
    desc: 'Stat tiles, AI role detection & work summaries',
  },
  {
    id: 4,
    title: 'Work Areas & AI Risks',
    desc: 'Codebase treemap visualizer, single-owner risks & AI insights',
  },
];

export function AppSnapshots() {
  const [activeStep, setActiveStep] = useState(1);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // 1-second slideshow interval (paused on hover)
  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev % 4) + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const assignment = assignIdentity(REACT_MOCK_CONTRIBUTORS);

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
            <span className="text-zinc-200">gitranked.com</span>
            <span className="text-[#ccff00] font-semibold">/repos/facebook/react</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded border border-[#ccff00]/30">
              <Sparkles className="w-3 h-3" /> LIVE APP
            </span>
          </div>
        </div>

        {/* Header Bar */}
        <div className="p-4 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-[#ccff00]" />
            <h3 className="text-lg font-black text-white uppercase tracking-tighter">FACEBOOK / REACT</h3>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="px-3 py-1 bg-white/5 border border-white/10 text-xs font-semibold text-white rounded-lg flex items-center gap-1">
              <RefreshCw className="w-3 h-3 text-[#ccff00]" /> Re-analyse
            </button>
            <button type="button" className="px-3 py-1 bg-white/5 border border-white/10 text-xs font-semibold text-white rounded-lg flex items-center gap-1">
              <Share2 className="w-3 h-3" /> Share
            </button>
          </div>
        </div>

        {/* Dynamic Viewport rendering actual repo components with FIXED HEIGHT (460px) */}
        <div className="p-4 md:p-6 h-[460px] overflow-y-auto bg-black text-left">
          <EvidenceProvider>
            <AnimatePresence mode="wait">
              {/* STEP 1: StatsStrip + Leaderboard */}
              {activeStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <StatsStrip contributors={REACT_MOCK_CONTRIBUTORS} healthMetrics={REACT_MOCK_HEALTH_METRICS} />
                  <Leaderboard
                    contributors={REACT_MOCK_CONTRIBUTORS}
                    assignment={assignment}
                    rankDeltas={null}
                    repoOwner="facebook"
                    repoName="react"
                  />
                </motion.div>
              )}

              {/* STEP 2: HealthCard + ActivityFeed */}
              {activeStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <div className="sleek-panel p-4">
                    <h3 className="text-base font-bold text-white mb-3">Team Health</h3>
                    <HealthCard metrics={REACT_MOCK_HEALTH_METRICS} metricEvidence={[]} />
                  </div>
                  <div className="sleek-panel p-4">
                    <h3 className="text-base font-bold text-white mb-3">Activity Feed</h3>
                    <ActivityFeed items={REACT_MOCK_ACTIVITY_FEED as any} identityColors={assignment.hexByUsername} />
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
                  className="space-y-4"
                >
                  <ContributorProfiles
                    contributors={REACT_MOCK_CONTRIBUTORS.slice(0, 3)}
                    contributorAiMap={new Map()}
                    contributorEvidence={[]}
                    repoOwner="facebook"
                    repoName="react"
                    assignment={assignment}
                    highlightByUser={new Map()}
                  />
                </motion.div>
              )}

              {/* STEP 4: WorkAreasHeatmap + AiInsights */}
              {activeStep === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <WorkAreasHeatmap contributors={REACT_MOCK_HEATMAP_CONTRIBUTORS} smallTeam={false} />
                  <AiInsights
                    overview={REACT_MOCK_OVERVIEW}
                    summary={REACT_MOCK_SUMMARY as any}
                    teamInsights={REACT_MOCK_TEAM_INSIGHTS as any}
                    risks={REACT_MOCK_SUMMARY.risks}
                    pool={[]}
                    usernames={REACT_MOCK_CONTRIBUTORS.map((c) => c.username)}
                    smallTeam={false}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </EvidenceProvider>
        </div>
      </div>

      {/* 2. FEATURE TABS SELECTOR (BELOW SNAPSHOT SCREEN) */}
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
              className={`p-3.5 text-left rounded-xl border transition-all duration-300 ${
                isActive
                  ? 'bg-zinc-900 border-[#ccff00] shadow-[0_0_20px_rgba(204,255,0,0.15)]'
                  : 'bg-zinc-950/80 border-zinc-800/80 hover:border-zinc-700 opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="font-bold text-xs text-white">{tab.title}</div>
                {isActive && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ccff00] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ccff00]"></span>
                  </span>
                )}
              </div>
              <div className="text-[11px] text-zinc-400 line-clamp-1">{tab.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

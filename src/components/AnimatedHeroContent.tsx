'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ContributionGrid } from '@/components/ContributionGrid';
import { AppSnapshots } from '@/components/AppSnapshots';
import { ArrowRight } from 'lucide-react';
import { GithubIcon } from '@/components/icons/GithubIcon';

export function AnimatedHeroContent({ isSignedIn }: { isSignedIn?: boolean }) {
  return (
    <div className="relative w-full">
      <ContributionGrid />
      <div className="flex flex-col lg:flex-row items-center justify-between gap-12 w-full px-6 md:px-12 lg:px-16 pt-12 pb-20 relative z-10 min-h-[75vh]">
        {/* Left Column: Hero Headline & CTAs */}
        <div className="flex-1 text-left w-full">
          <motion.h1 
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tighter uppercase leading-[0.95] mb-6 relative z-10"
          >
            RANK YOUR <br />
            <span className="text-[#ccff00]">CONTRIBUTORS</span>.
          </motion.h1>

          <motion.p 
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: 0.12 }}
            className="text-base sm:text-lg lg:text-xl text-zinc-400 max-w-2xl mb-8 font-medium relative z-10 leading-relaxed"
          >
            Evaluating true developer impact through AI fact extraction, multi-dimension scoring (Impact, Quality, Collaboration, Consistency), and team health metrics.
          </motion.p>

          <motion.div 
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4 relative z-10 pointer-events-auto"
          >
            {isSignedIn ? (
              <Link
                href="/dashboard"
                className="px-8 py-4 bg-[#ccff00] text-black border-2 border-[#ccff00] font-black uppercase tracking-wider hover:bg-white hover:border-white transition-colors flex items-center justify-center gap-2 text-sm"
              >
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <a
                href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
                className="px-8 py-4 bg-white text-black border-2 border-white font-black uppercase tracking-wider hover:bg-[#ccff00] hover:border-[#ccff00] transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <GithubIcon className="w-5 h-5" />
                CONNECT TO GITHUB
              </a>
            )}
          </motion.div>
        </div>

        {/* Right Column: Workflow Interactive Snapshots */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.15 }}
          className="w-full lg:flex-1"
        >
          <AppSnapshots />
        </motion.div>
      </div>
    </div>
  );
}

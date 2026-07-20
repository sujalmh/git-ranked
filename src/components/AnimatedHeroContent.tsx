'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ContributionGrid } from '@/components/ContributionGrid';

export function AnimatedHeroContent({ isSignedIn }: { isSignedIn?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center w-full pt-24 pb-32 text-center relative z-10 min-h-[70vh]">
      <ContributionGrid />
      
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring" as const, stiffness: 300, damping: 20 }}
        className="relative z-10 pointer-events-none"
      >
        <div className="inline-block px-4 py-1 mb-8 border-2 border-[#ccff00] text-[#ccff00] text-xs font-black uppercase tracking-widest pointer-events-auto">
          GIT RANKED
        </div>
      </motion.div>

      <motion.h1 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring" as const, stiffness: 300, damping: 20, delay: 0.1 }}
        className="text-6xl md:text-8xl font-black tracking-tighter uppercase leading-[0.9] mb-8 max-w-5xl mx-auto relative z-10 pointer-events-none"
      >
        RANK YOUR <br />
        <span className="text-[#ccff00]">CONTRIBUTORS</span>.
      </motion.h1>

      <motion.p 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring" as const, stiffness: 300, damping: 20, delay: 0.2 }}
        className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 font-medium relative z-10 pointer-events-none"
      >
        Not another generic repo analyzer. GitRanked evaluates true impact, identifying who acts as an architect, reviewer, or maintainer based on real data.
      </motion.p>

      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring" as const, stiffness: 300, damping: 20, delay: 0.3 }}
        className="flex flex-col sm:flex-row gap-4 relative z-10 pointer-events-auto"
      >
        {isSignedIn ? (
          <Link
            href="/dashboard"
            className="px-8 py-4 bg-[#ccff00] text-black border-2 border-[#ccff00] font-black uppercase tracking-wider hover:bg-white hover:border-white transition-colors flex items-center justify-center"
          >
            Go to Dashboard
          </Link>
        ) : (
          <>
            <a
              href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
              className="px-8 py-4 bg-white text-black border-2 border-white font-black uppercase tracking-wider hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                className="w-6 h-6 fill-black"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Connect to GitHub
            </a>
          </>
        )}
      </motion.div>
    </div>
  );
}

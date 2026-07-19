'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

export function AnimatedHeroContent() {
  return (
    <div className="flex flex-col items-center justify-center pt-24 pb-32 text-center relative z-10">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <div className="inline-block px-4 py-1 mb-8 border-2 border-[#ccff00] text-[#ccff00] text-xs font-black uppercase tracking-widest">
          SYSTEM ACTIVE
        </div>
      </motion.div>

      <motion.h1 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
        className="text-6xl md:text-8xl font-black tracking-tighter uppercase leading-[0.9] mb-8 max-w-5xl mx-auto"
      >
        MOVE BEYOND <br />
        <span className="text-[#ccff00]">LINES OF CODE</span>.
      </motion.h1>

      <motion.p 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
        className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 font-medium"
      >
        GitRanked analyzes PRs, code reviews, and issue resolution to give you a true, data-backed picture of repository health and contributor impact.
      </motion.p>

      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.3 }}
        className="flex flex-col sm:flex-row gap-4"
      >
        <Link
          href="/dashboard"
          className="px-8 py-4 bg-white text-black font-black uppercase tracking-wider hover:bg-zinc-200 transition-colors"
        >
          OPEN DASHBOARD
        </Link>
        <a
          href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
          className="px-8 py-4 bg-black border-2 border-white text-white font-black uppercase tracking-wider hover:bg-white hover:text-black transition-colors"
        >
          INSTALL APP
        </a>
      </motion.div>
    </div>
  );
}

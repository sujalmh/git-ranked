'use client';

import React from 'react';
import { motion } from 'framer-motion';

export function VisualPipeline() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { type: 'spring' as const, stiffness: 400, damping: 30 } },
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-12">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        className="flex flex-col md:flex-row items-stretch justify-center gap-6"
      >
        {/* Step 1 */}
        <motion.div variants={itemVariants} className="flex-1 bg-black text-white border-b-2 border-r-2 border-zinc-800 hover:border-[#ccff00] p-6 sm:p-10 text-center group hover:bg-white hover:text-black transition-all duration-300 shadow-[6px_6px_0_0_#333] sm:shadow-[8px_8px_0_0_#333] hover:shadow-[8px_8px_0_0_#ccff00] relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-[#ccff00] text-5xl sm:text-6xl font-black mb-4 sm:mb-6 tracking-tighter">01</div>
            <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-3 sm:mb-4 text-white group-hover:text-black transition-colors">Sync</h3>
            <p className="text-sm sm:text-base font-medium text-zinc-300 group-hover:text-black transition-colors">Index PRs, commits, and reviews instantly.</p>
          </div>
        </motion.div>

        {/* Separator / Arrow */}
        <motion.div variants={itemVariants} className="hidden md:flex items-center justify-center">
          <div className="flex items-center">
            <div className="w-12 h-3 bg-zinc-800" />
            <div className="w-0 h-0 border-t-[12px] border-t-transparent border-l-[16px] border-l-zinc-800 border-b-[12px] border-b-transparent" />
          </div>
        </motion.div>

        {/* Step 2 */}
        <motion.div variants={itemVariants} className="flex-1 bg-[#ccff00] text-black border-b-2 border-r-2 border-[#ccff00] hover:border-[#ccff00] p-6 sm:p-10 text-center group hover:bg-white transition-all duration-300 shadow-[6px_6px_0_0_#fff] sm:shadow-[8px_8px_0_0_#fff] hover:shadow-[8px_8px_0_0_#ccff00] relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-black group-hover:text-[#ccff00] text-5xl sm:text-6xl font-black mb-4 sm:mb-6 tracking-tighter transition-colors">02</div>
            <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-3 sm:mb-4 text-black">Evaluate</h3>
            <p className="text-sm sm:text-base font-medium text-black">AI determines each contributor&apos;s true impact and role.</p>
          </div>
        </motion.div>

        {/* Separator / Arrow */}
        <motion.div variants={itemVariants} className="hidden md:flex items-center justify-center">
          <div className="flex items-center">
            <div className="w-12 h-3 bg-zinc-800" />
            <div className="w-0 h-0 border-t-[12px] border-t-transparent border-l-[16px] border-l-zinc-800 border-b-[12px] border-b-transparent" />
          </div>
        </motion.div>

        {/* Step 3 */}
        <motion.div variants={itemVariants} className="flex-1 bg-black text-white border-b-2 border-r-2 border-zinc-800 hover:border-[#ccff00] p-6 sm:p-10 text-center group hover:bg-white hover:text-black transition-all duration-300 shadow-[6px_6px_0_0_#333] sm:shadow-[8px_8px_0_0_#333] hover:shadow-[8px_8px_0_0_#ccff00] relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-[#ccff00] text-5xl sm:text-6xl font-black mb-4 sm:mb-6 tracking-tighter">03</div>
            <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-3 sm:mb-4 text-white group-hover:text-black transition-colors">Rank</h3>
            <p className="text-sm sm:text-base font-medium text-zinc-300 group-hover:text-black transition-colors">Clear dashboards highlighting your true MVPs.</p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

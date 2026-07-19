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
        <motion.div variants={itemVariants} className="flex-1 stark-panel p-10 text-center group stark-panel-hover shadow-[8px_8px_0_0_#333] hover:shadow-[8px_8px_0_0_#ccff00] transition-all relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-[#ccff00] text-6xl font-black mb-6 group-hover:text-black transition-colors tracking-tighter">01</div>
            <h3 className="text-3xl font-black uppercase tracking-tight mb-4">Sync</h3>
            <p className="text-base font-medium">Index PRs, commits, and reviews instantly.</p>
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
        <motion.div variants={itemVariants} className="flex-1 accent-panel p-10 text-center group hover:bg-white hover:border-white transition-all shadow-[8px_8px_0_0_#fff] relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-black text-6xl font-black mb-6 tracking-tighter">02</div>
            <h3 className="text-3xl font-black uppercase tracking-tight mb-4">Evaluate</h3>
            <p className="text-base font-medium">AI determines each contributor&apos;s true impact and role.</p>
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
        <motion.div variants={itemVariants} className="flex-1 stark-panel p-10 text-center group stark-panel-hover shadow-[8px_8px_0_0_#333] hover:shadow-[8px_8px_0_0_#ccff00] transition-all relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-[#ccff00] text-6xl font-black mb-6 group-hover:text-black transition-colors tracking-tighter">03</div>
            <h3 className="text-3xl font-black uppercase tracking-tight mb-4">Rank</h3>
            <p className="text-base font-medium">Clear dashboards highlighting your true MVPs.</p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

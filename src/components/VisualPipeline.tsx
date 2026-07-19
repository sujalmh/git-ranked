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
        <motion.div variants={itemVariants} className="flex-1 stark-panel p-8 text-center group stark-panel-hover">
          <div className="text-[#ccff00] text-5xl font-black mb-4 group-hover:text-black transition-colors">01</div>
          <h3 className="text-xl font-black uppercase tracking-tight mb-2">Sync</h3>
          <p className="text-sm font-medium">Index PRs, commits, and reviews instantly.</p>
        </motion.div>

        {/* Separator / Arrow */}
        <motion.div variants={itemVariants} className="hidden md:flex items-center justify-center">
          <div className="w-8 h-2 bg-white" />
        </motion.div>

        {/* Step 2 */}
        <motion.div variants={itemVariants} className="flex-1 accent-panel p-8 text-center group hover:bg-white hover:border-white transition-colors">
          <div className="text-black text-5xl font-black mb-4 group-hover:text-black">02</div>
          <h3 className="text-xl font-black uppercase tracking-tight mb-2">Evaluate</h3>
          <p className="text-sm font-medium">AI determines each contributor&apos;s true impact and role.</p>
        </motion.div>

        {/* Separator / Arrow */}
        <motion.div variants={itemVariants} className="hidden md:flex items-center justify-center">
          <div className="w-8 h-2 bg-white" />
        </motion.div>

        {/* Step 3 */}
        <motion.div variants={itemVariants} className="flex-1 stark-panel p-8 text-center group stark-panel-hover">
          <div className="text-[#ccff00] text-5xl font-black mb-4 group-hover:text-black transition-colors">03</div>
          <h3 className="text-xl font-black uppercase tracking-tight mb-2">Rank</h3>
          <p className="text-sm font-medium">Clear dashboards highlighting your true MVPs.</p>
        </motion.div>
      </motion.div>
    </div>
  );
}

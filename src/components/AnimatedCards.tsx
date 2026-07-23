'use client';

import React from 'react';
import { motion } from 'framer-motion';

export function AnimatedCards() {
  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5, ease: 'easeOut' as const }
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10 w-full">
      {/* Managers Card */}
      <motion.div 
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        className="stark-panel p-6 sm:p-12 flex flex-col group shadow-[8px_8px_0_0_#333] sm:shadow-[12px_12px_0_0_#333] hover:shadow-[12px_12px_0_0_#ccff00] sm:hover:shadow-[16px_16px_0_0_#ccff00] hover:-translate-y-2 hover:-rotate-1 transition-all duration-300 origin-bottom-left"
      >
        <div className="text-[#ccff00] font-black text-lg sm:text-2xl tracking-widest uppercase mb-4 sm:mb-6 group-hover:text-white transition-colors">
          Engineering Managers
        </div>
        <h3 className="text-3xl sm:text-5xl md:text-6xl font-black mb-4 sm:mb-8 uppercase leading-[0.95]">
          Find your<br/>true <span className="text-[#ccff00]">MVPs</span>.
        </h3>
        <p className="font-medium text-base sm:text-xl leading-relaxed mt-auto text-zinc-300 group-hover:text-white transition-colors">
          Identify your silent reviewers and architectural heavy-lifters. See exactly who is carrying the project forward.
        </p>
      </motion.div>
      
      {/* Developers Card */}
      <motion.div 
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        className="stark-panel p-6 sm:p-12 flex flex-col group shadow-[8px_8px_0_0_#333] sm:shadow-[12px_12px_0_0_#333] hover:shadow-[12px_12px_0_0_#fff] sm:hover:shadow-[16px_16px_0_0_#fff] hover:-translate-y-2 hover:rotate-1 transition-all duration-300 origin-bottom-right"
      >
        <div className="text-white font-black text-lg sm:text-2xl tracking-widest uppercase mb-4 sm:mb-6 group-hover:text-[#ccff00] transition-colors">
          Developers & Maintainers
        </div>
        <h3 className="text-3xl sm:text-5xl md:text-6xl font-black mb-4 sm:mb-8 uppercase leading-[0.95]">
          Get ranked<br/>for your <span className="text-[#ccff00]">role</span>.
        </h3>
        <p className="font-medium text-base sm:text-xl leading-relaxed mt-auto text-zinc-300 group-hover:text-white transition-colors">
          We separate the architects from the spammers. Your complex reviews and critical PRs finally get the rank they deserve.
        </p>
      </motion.div>
    </div>
  );
}

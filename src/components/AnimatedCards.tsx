'use client';

import React from 'react';
import { motion } from 'framer-motion';

export function AnimatedCards() {
  const cardVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { type: "spring" as const, stiffness: 400, damping: 30 }
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10 w-full">
      {/* Managers Card */}
      <motion.div 
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        className="stark-panel p-12 flex flex-col group shadow-[12px_12px_0_0_#333] hover:shadow-[16px_16px_0_0_#ccff00] hover:-translate-y-2 hover:-rotate-1 transition-all duration-300 origin-bottom-left"
      >
        <div className="text-[#ccff00] font-black text-2xl tracking-widest uppercase mb-6 group-hover:text-white transition-colors">
          Engineering Managers
        </div>
        <h3 className="text-5xl md:text-6xl font-black mb-8 uppercase leading-[0.9]">
          Find your<br/>true <span className="text-[#ccff00]">MVPs</span>.
        </h3>
        <p className="font-medium text-xl leading-relaxed mt-auto text-zinc-300 group-hover:text-white transition-colors">
          Identify your silent reviewers and architectural heavy-lifters. See exactly who is carrying the project forward.
        </p>
      </motion.div>
      
      {/* Developers Card */}
      <motion.div 
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        className="stark-panel p-12 flex flex-col group shadow-[12px_12px_0_0_#333] hover:shadow-[16px_16px_0_0_#fff] hover:-translate-y-2 hover:rotate-1 transition-all duration-300 origin-bottom-right"
      >
        <div className="text-white font-black text-2xl tracking-widest uppercase mb-6 group-hover:text-[#ccff00] transition-colors">
          Developers & Maintainers
        </div>
        <h3 className="text-5xl md:text-6xl font-black mb-8 uppercase leading-[0.9]">
          Get ranked<br/>for your <span className="text-[#ccff00]">role</span>.
        </h3>
        <p className="font-medium text-xl leading-relaxed mt-auto text-zinc-300 group-hover:text-white transition-colors">
          We separate the architects from the spammers. Your complex reviews and critical PRs finally get the rank they deserve.
        </p>
      </motion.div>
    </div>
  );
}

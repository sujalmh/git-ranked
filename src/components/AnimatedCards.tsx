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
        className="stark-panel p-10 flex flex-col group stark-panel-hover"
      >
        <div className="text-[#ccff00] font-black text-xl tracking-widest uppercase mb-4 group-hover:text-black transition-colors">
          Engineering Managers
        </div>
        <h3 className="text-3xl font-black mb-6 uppercase leading-tight">
          Find your<br/>true MVPs.
        </h3>
        <p className="font-medium text-lg leading-relaxed mt-auto">
          Identify your silent reviewers and architectural heavy-lifters. See exactly who is carrying the project forward.
        </p>
      </motion.div>
      
      {/* Developers Card */}
      <motion.div 
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        className="stark-panel p-10 flex flex-col group stark-panel-hover"
      >
        <div className="text-white font-black text-xl tracking-widest uppercase mb-4 group-hover:text-black transition-colors">
          Developers & Maintainers
        </div>
        <h3 className="text-3xl font-black mb-6 uppercase leading-tight">
          Get recognized<br/>for your role.
        </h3>
        <p className="font-medium text-lg leading-relaxed mt-auto">
          We separate the architects from the spammers. Your complex reviews and critical PRs finally get the rank they deserve.
        </p>
      </motion.div>
    </div>
  );
}

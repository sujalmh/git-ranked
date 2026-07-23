'use client';

import React from 'react';
import { motion } from 'framer-motion';

function FeatureCard({ title, description, delay, index }: { title: string, description: string, delay: number, index: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ type: "spring" as const, stiffness: 300, damping: 25, delay }}
      className="bg-black border-2 border-white p-6 sm:p-10 flex flex-col group cursor-default relative overflow-hidden shadow-[4px_4px_0_0_#fff] sm:shadow-[6px_6px_0_0_#fff] hover:shadow-[8px_8px_0_0_#ccff00] hover:-translate-y-1 hover:border-[#ccff00] transition-all duration-300"
    >
      <div className="absolute -top-6 -right-4 text-7xl sm:text-9xl font-black text-white/10 group-hover:text-[#ccff00]/10 transition-colors select-none z-0 pointer-events-none">
        0{index}
      </div>
      <div className="relative z-10">
        <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-3 sm:mb-4 text-white group-hover:text-[#ccff00] transition-colors">{title}</h3>
        <div className="w-10 sm:w-12 h-1.5 sm:h-2 bg-white mb-4 sm:mb-6 group-hover:bg-[#ccff00] transition-colors" />
        <p className="text-base sm:text-lg font-medium leading-relaxed text-zinc-400 group-hover:text-white transition-colors">{description}</p>
      </div>
    </motion.div>
  );
}

export function AnimatedFeatures() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full text-left mt-20">
      <FeatureCard
        index={1}
        title="Role Detection"
        description="Automatically identify who acts as a core architect, a critical reviewer, or a bug-fixer based on their actual PR activity."
        delay={0}
      />
      <FeatureCard
        index={2}
        title="True Impact"
        description="Scoring rewards deep code reviews and complex architectural contributions, ignoring meaningless commit spam."
        delay={0.1}
      />
      <FeatureCard
        index={3}
        title="Leaderboards"
        description="Clear, undeniable, data-backed rankings of contributor value across your entire codebase."
        delay={0.2}
      />
    </div>
  );
}

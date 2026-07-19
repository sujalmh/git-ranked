'use client';

import React from 'react';
import { motion } from 'framer-motion';

function FeatureCard({ title, description, delay }: { title: string, description: string, delay: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ type: "spring", stiffness: 300, damping: 25, delay }}
      className="stark-panel stark-panel-hover p-8 flex flex-col group cursor-default"
    >
      <h3 className="text-2xl font-black uppercase tracking-tight mb-4 group-hover:text-[#ccff00] transition-colors">{title}</h3>
      <div className="w-8 h-1 bg-white mb-4 group-hover:bg-[#ccff00] transition-colors" />
      <p className="text-sm font-medium leading-relaxed group-hover:text-black transition-colors">{description}</p>
    </motion.div>
  );
}

export function AnimatedFeatures() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left mt-14">
      <FeatureCard
        title="Quality > Quantity"
        description="Scoring rewards high-impact PRs and thorough reviews, ignoring commit spam and meaningless metrics."
        delay={0}
      />
      <FeatureCard
        title="AI Engine"
        description="Identified risks, bottlenecks, and team momentum. Every finding is backed by real PR analysis."
        delay={0.1}
      />
      <FeatureCard
        title="Health Radar"
        description="A clear, geometric radar of delivery speed, code quality, review depth, and knowledge distribution."
        delay={0.2}
      />
    </div>
  );
}

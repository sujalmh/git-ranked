'use client';

import React from 'react';
import { motion } from 'framer-motion';

export function AnimatedBackground() {
  return (
    <>
      <motion.div 
        animate={{ 
          x: [0, 50, -50, 0],
          y: [0, -50, 50, 0],
          scale: [1, 1.2, 0.8, 1] 
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" 
      />
      <motion.div 
        animate={{ 
          x: [0, -50, 50, 0],
          y: [0, 50, -50, 0],
          scale: [1, 0.8, 1.2, 1] 
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear", delay: 2 }}
        className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/20 blur-[120px] pointer-events-none" 
      />
    </>
  );
}

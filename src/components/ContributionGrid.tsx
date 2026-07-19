'use client';

import React, { useEffect, useState, useRef } from 'react';

export function ContributionGrid() {
  const [mounted, setMounted] = useState(false);
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });
  const containerRef = useRef<HTMLDivElement>(null);
  const rows = 20;
  const cols = 40;
  const totalTiles = rows * cols;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="absolute inset-0 z-0 overflow-hidden" />;
  }

  // Generate deterministic but random-looking base opacities for the tiles
  const getBaseOpacity = (index: number) => {
    const seed = Math.sin(index * 12.9898) * 43758.5453;
    const rand = seed - Math.floor(seed);
    
    if (rand < 0.6) return 0.05; // mostly empty
    if (rand < 0.8) return 0.15; // some light
    if (rand < 0.95) return 0.3; // some medium
    return 0.6; // rare heavy
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: -1000, y: -1000 });
  };

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-auto"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Combined masks to fade out the middle and top/bottom edges, leaving the sides visible */}
      <div 
        className="absolute inset-0 pointer-events-none" 
        style={{
          background: `
            linear-gradient(to right, transparent 0%, rgba(0,0,0,0.6) 20%, rgba(0,0,0,0.85) 50%, rgba(0,0,0,0.6) 80%, transparent 100%),
            linear-gradient(to bottom, black 0%, transparent 20%, transparent 80%, black 100%)
          `,
          zIndex: 2
        }} 
      />
      
      {/* Base Grid Wrapper */}
      <div 
        className="relative pointer-events-none"
        style={{ 
          width: '120vw',
          height: '100vh',
          transform: 'rotate(-5deg) scale(1.2)', // Slight tilt for a dynamic feel
        }}
      >
        <div 
          className="absolute inset-0 grid gap-1.5 opacity-60 pointer-events-none"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: totalTiles }).map((_, i) => (
            <div
              key={i}
              className="w-full aspect-square rounded-[2px]"
              style={{ backgroundColor: `rgba(204, 255, 0, ${getBaseOpacity(i)})` }}
            />
          ))}
        </div>
      </div>

      {/* Hover Glow Mask Wrapper (Un-transformed for accurate mouse coordinates) */}
      <div 
        className="absolute inset-0 pointer-events-none flex items-center justify-center transition-opacity duration-300"
        style={{ 
          WebkitMaskImage: `radial-gradient(120px circle at ${mousePos.x}px ${mousePos.y}px, black 0%, transparent 100%)`,
          maskImage: `radial-gradient(120px circle at ${mousePos.x}px ${mousePos.y}px, black 0%, transparent 100%)`,
        }}
      >
        {/* Hover Glow Grid (Same transform as base grid so tiles perfectly align) */}
        <div 
          className="grid gap-1.5 opacity-70 pointer-events-none"
          style={{ 
            width: '120vw',
            height: '100vh',
            transform: 'rotate(-5deg) scale(1.2)', 
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: totalTiles }).map((_, i) => (
            <div
              key={i}
              className="w-full aspect-square rounded-[2px] bg-[#ccff00]"
              style={{
                boxShadow: '0 0 10px rgba(204, 255, 0, 0.4)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

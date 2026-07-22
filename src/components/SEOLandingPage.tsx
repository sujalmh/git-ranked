'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ContributionGrid } from '@/components/ContributionGrid';
import type { SEOPageData } from '@/lib/seo-content';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { Footer } from '@/components/Footer';
import { AppSnapshots } from '@/components/AppSnapshots';

export function SEOLandingPage({ data }: { data: SEOPageData }) {
  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-black text-white">
      {/* Header (Simplified from main page) */}
      <header className="w-full z-10 border-b-2 border-white/10 relative">
        <div className="flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full">
          <Link href="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="GitRanked Logo" className="w-8 h-8 rounded-none" />
            <span className="text-2xl font-black tracking-tighter uppercase">GitRanked</span>
          </Link>
          <nav className="flex gap-6 items-center">
            <Link href="/api/auth/signin" className="text-sm font-bold tracking-wider hover:text-[#ccff00] transition-colors uppercase">
              Log In
            </Link>
            <a 
              href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`} 
              className="px-5 py-2 accent-panel text-sm"
            >
              CONNECT TO GITHUB
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full z-10 relative">
        {/* SEO Hero Section */}
        <div className="flex flex-col items-center justify-center w-full pt-24 pb-24 text-center relative z-10 min-h-[60vh]">
          <ContributionGrid />
          
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="relative z-10 pointer-events-none"
          >
            <div className="inline-block px-4 py-1 mb-8 border-2 border-[#ccff00] text-[#ccff00] text-xs font-black uppercase tracking-widest pointer-events-auto">
              GIT RANKED FOR TEAMS
            </div>
          </motion.div>

          <motion.h1 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
            className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.9] mb-8 max-w-5xl mx-auto relative z-10 pointer-events-none px-4"
          >
            {data.heroTitle} <br />
            <span className="text-[#ccff00]">{data.heroHighlight}</span>.
          </motion.h1>

          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
            className="text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto mb-10 font-medium relative z-10 pointer-events-none px-6"
          >
            {data.heroSubtitle}
          </motion.p>

          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 relative z-10 pointer-events-auto px-6"
          >
            <a
              href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
              className="px-8 py-4 bg-[#ccff00] text-black border-2 border-[#ccff00] font-black uppercase tracking-wider hover:bg-white hover:border-white transition-colors flex items-center justify-center gap-2"
            >
              Analyze Your Repo <ArrowRight className="w-5 h-5" />
            </a>
          </motion.div>

          <AppSnapshots />
        </div>

        {/* Content Sections */}
        <div className="max-w-4xl mx-auto px-6 py-12">
          {/* About GitRanked Section */}
          <div className="mb-20 p-8 sm:p-10 border-2 border-white/10 bg-zinc-950/80 relative">
            <div className="inline-block px-3 py-1 mb-4 border border-[#ccff00] bg-[#ccff00]/10 text-[#ccff00] text-xs font-black uppercase tracking-widest">
              ABOUT GITRANKED
            </div>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4 text-white">
              AI-Powered GitHub Engineering Analytics
            </h2>
            <p className="text-zinc-300 text-lg leading-relaxed mb-8">
              GitRanked is an engineering insights and analytics platform designed for software teams, tech leaders, and maintainers. By analyzing real-time GitHub activity—including pull requests, code reviews, commit histories, and contributor patterns—GitRanked delivers objective visibility into repository health, review bottlenecks, and true developer impact.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="p-5 border border-white/10 bg-black/60">
                <div className="text-[#ccff00] text-2xl font-black mb-2">01</div>
                <h3 className="text-white font-bold uppercase text-base mb-1">Instant Setup</h3>
                <p className="text-zinc-400 text-sm">Connect your GitHub organization or repositories with a single click via GitHub App.</p>
              </div>
              <div className="p-5 border border-white/10 bg-black/60">
                <div className="text-[#ccff00] text-2xl font-black mb-2">02</div>
                <h3 className="text-white font-bold uppercase text-base mb-1">PR & Review Insights</h3>
                <p className="text-zinc-400 text-sm">Identify cycle time delays, review burdens, and code churn before bottlenecks impact delivery.</p>
              </div>
              <div className="p-5 border border-white/10 bg-black/60">
                <div className="text-[#ccff00] text-2xl font-black mb-2">03</div>
                <h3 className="text-white font-bold uppercase text-base mb-1">AI Health Scoring</h3>
                <p className="text-zinc-400 text-sm">Automated impact scoring and repository health metrics powered by advanced AI models.</p>
              </div>
            </div>

            {/* Connect to GitHub Card */}
            <div className="p-6 sm:p-8 bg-[#ccff00] text-black flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tight mb-2">
                  Connect to GitHub & Start Using GitRanked
                </h3>
                <p className="text-black/80 font-medium text-sm sm:text-base">
                  Connect your GitHub repositories in less than a minute to generate real-time metrics and AI insights.
                </p>
              </div>
              <a
                href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
                className="px-6 py-4 bg-black text-white font-black uppercase tracking-wider hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 shrink-0 w-full md:w-auto text-center"
              >
                Connect to GitHub <ArrowRight className="w-5 h-5 text-[#ccff00]" />
              </a>
            </div>
          </div>

          <div className="prose prose-invert prose-lg mx-auto w-full">
            {data.sections.map((section, index) => (
              <div key={index} className="mb-16">
                <h2 className="text-3xl font-black tracking-tight mb-6 uppercase text-white">{section.title}</h2>
                <div className="w-12 h-1 bg-[#ccff00] mb-6"></div>
                <p className="text-zinc-300 leading-relaxed text-lg">
                  {section.content}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQs */}
        <div className="max-w-4xl mx-auto px-6 py-16 mb-24 border-t border-white/10">
          <h2 className="text-4xl font-black tracking-tight mb-12 uppercase text-center">Frequently Asked Questions</h2>
          <div className="grid gap-6">
            {data.faqs.map((faq, index) => (
              <div key={index} className="sleek-panel p-6 sm:p-8 hover:border-white/20 transition-colors">
                <h3 className="text-xl font-bold mb-3 flex items-start gap-3">
                  <ChevronRight className="w-6 h-6 text-[#ccff00] shrink-0 mt-0.5" />
                  {faq.question}
                </h3>
                <p className="text-zinc-400 leading-relaxed ml-9">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="w-full bg-[#ccff00] text-black py-20 text-center px-6">
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-6">Ready to see the data?</h2>
          <p className="text-xl font-medium max-w-2xl mx-auto mb-10 text-black/80">
            Join the engineering teams using GitRanked to measure what actually matters.
          </p>
          <a
            href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
            className="inline-flex px-8 py-4 bg-black text-white font-black uppercase tracking-wider hover:bg-zinc-800 transition-colors items-center justify-center gap-3"
          >
            Connect to GitHub & Start Free <ArrowRight className="w-5 h-5 text-[#ccff00]" />
          </a>
        </div>
      </main>
      
      {/* Footer */}
      <Footer />
    </div>
  );
}

import Link from 'next/link';
import Image from 'next/image';
import { GitBranch, Activity, Brain, Shield } from 'lucide-react';
import { HeroVisual } from '@/components/HeroVisual';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/20 blur-[120px] pointer-events-none" />

      <header className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto w-full z-10">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="GitRanked Logo" width={28} height={28} className="rounded-full shadow-md" />
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-500 to-amber-500 bg-clip-text text-transparent">GitRanked</span>
        </div>
        <nav className="flex gap-5 items-center">
          <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white transition-colors">Dashboard</Link>
          <a 
            href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`} 
            className="px-4 py-1.5 rounded-full bg-white text-black text-sm font-medium hover:bg-zinc-200 transition-colors"
          >
            Install App
          </a>
        </nav>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 z-10 mt-6 mb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass mb-5 border-indigo-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-medium text-zinc-300">Live Repo Tracking Enabled</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-[1.05]">
              Measure what <span className="text-gradient">matters</span>.
            </h1>

            <p className="text-base text-zinc-400 mb-6 max-w-lg leading-relaxed">
              A live analysis board for repository health and contributor impact — powered by quality-biased scoring and AI.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/dashboard"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-all shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)]"
              >
                Go to Dashboard
              </Link>
              <a
                href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
                className="px-5 py-2.5 rounded-xl glass hover:bg-white/10 font-semibold text-sm transition-all flex items-center gap-2 justify-center"
              >
                <GitBranch className="w-4 h-4" /> Add to GitHub
              </a>
            </div>
          </div>

          <HeroVisual />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full text-left mt-14">
          <FeatureCard
            icon={<Activity className="w-5 h-5 text-pink-400" />}
            title="Quality over Quantity"
            description="Scoring rewards high-impact PRs and thorough reviews, not commit spam."
          />
          <FeatureCard
            icon={<Brain className="w-5 h-5 text-purple-400" />}
            title="AI Findings"
            description="Surfaced risks, bottlenecks, and momentum — each with a Why? backed by real PRs."
          />
          <FeatureCard
            icon={<Shield className="w-5 h-5 text-indigo-400" />}
            title="Health Radar"
            description="An animated radar of delivery, quality, reviews, and knowledge distribution."
          />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="glass-card p-5 flex flex-col gap-3 group">
      <div className="p-2.5 rounded-lg bg-white/5 w-fit group-hover:bg-white/10 transition-colors">
        {icon}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}

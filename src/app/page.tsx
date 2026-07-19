import Link from 'next/link';
import Image from 'next/image';
import { GitBranch, Activity, Brain, Shield, CheckCircle, Users, Cpu, LineChart } from 'lucide-react';
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
              Move beyond <span className="text-gradient">lines of code</span>.
            </h1>

            <p className="text-base text-zinc-400 mb-6 max-w-lg leading-relaxed">
              GitRanked analyzes PRs, code reviews, and issue resolution to give you a true picture of repository health and contributor impact — powered by AI.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/dashboard"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-all shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)] flex items-center justify-center"
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

        {/* How it Works Section */}
        <div className="mt-32">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">How it works</h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">Get deep insights into your engineering team&apos;s performance in three simple steps.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-1/2 left-[16%] right-[16%] h-[2px] bg-gradient-to-r from-indigo-500/10 via-purple-500/30 to-pink-500/10 -translate-y-1/2 z-0" />
            
            <StepCard 
              number="1"
              icon={<GitBranch className="w-6 h-6 text-indigo-400" />}
              title="Connect GitHub"
              description="Install the GitRanked app on your repositories. We securely sync PRs, commits, and reviews."
            />
            <StepCard 
              number="2"
              icon={<Cpu className="w-6 h-6 text-purple-400" />}
              title="AI Analysis"
              description="Our engine evaluates code quality, collaboration, and delivery speed to identify true impact."
            />
            <StepCard 
              number="3"
              icon={<LineChart className="w-6 h-6 text-pink-400" />}
              title="Get Insights"
              description="View your live dashboard to identify bottlenecks, top contributors, and repository health."
            />
          </div>
        </div>

        {/* Who is it for Section */}
        <div className="mt-32 mb-10">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Who is it for?</h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">Built for engineering teams who care about quality and impact.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-8 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all" />
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold">Engineering Managers</h3>
              </div>
              <p className="text-zinc-400 leading-relaxed">
                Track team velocity and repository health without micromanaging. Identify knowledge silos and ensure code reviews are thorough and effective.
              </p>
            </div>
            
            <div className="glass-card p-8 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl group-hover:bg-amber-500/20 transition-all" />
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold">Developers & Maintainers</h3>
              </div>
              <p className="text-zinc-400 leading-relaxed">
                Get a fair assessment of your contributions. We reward high-impact PRs and quality code reviews, not just the sheer volume of commits.
              </p>
            </div>
          </div>
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

function StepCard({ number, icon, title, description }: { number: string, icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="glass-card p-6 flex flex-col items-center text-center relative z-10 bg-[#09090b]/80">
      <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-inner relative">
        <div className="absolute -top-3 -left-3 w-6 h-6 rounded-full bg-indigo-600 text-[10px] font-bold flex items-center justify-center text-white border-2 border-[#09090b]">
          {number}
        </div>
        {icon}
      </div>
      <h3 className="text-lg font-bold mb-3">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}

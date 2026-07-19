import Link from 'next/link';
import { GitBranch, Activity, Brain, Shield } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/20 blur-[120px] pointer-events-none" />

      <header className="flex items-center justify-between p-6 max-w-7xl mx-auto w-full z-10">
        <div className="flex items-center gap-2">
          <GitBranch className="w-8 h-8 text-indigo-400" />
          <span className="text-2xl font-bold tracking-tight">GitRanked</span>
        </div>
        <nav className="flex gap-6 items-center">
          <Link href="/dashboard" className="text-zinc-400 hover:text-white transition-colors">Dashboard</Link>
          <a 
            href="/api/auth/signin?callbackUrl=/install" 
            className="px-5 py-2 rounded-full bg-white text-black font-medium hover:bg-zinc-200 transition-colors"
          >
            Install App
          </a>
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 z-10 max-w-5xl mx-auto mt-20 mb-32">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8 border-indigo-500/30">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-medium text-zinc-300">Live Repo Tracking Enabled</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight">
          Measure what <span className="text-gradient">matters</span>.
        </h1>
        
        <p className="text-xl text-zinc-400 mb-12 max-w-2xl leading-relaxed">
          GitRanked tracks every push, PR, and review. We use quality-biased scoring and AI to give you a crystal-clear analysis board of your repository's health and contributor impact.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 mb-24">
          <Link 
            href="/dashboard"
            className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-lg transition-all shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)]"
          >
            Go to Dashboard
          </Link>
          <a 
            href="/api/auth/signin?callbackUrl=/install"
            className="px-8 py-4 rounded-xl glass hover:bg-white/10 font-semibold text-lg transition-all flex items-center gap-2 justify-center"
          >
            <GitBranch className="w-5 h-5" /> Add to GitHub
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
          <FeatureCard 
            icon={<Activity className="w-6 h-6 text-pink-400" />}
            title="Quality over Quantity"
            description="Our advanced scoring algorithm rewards high-impact PRs and thorough reviews, not just commit spam."
          />
          <FeatureCard 
            icon={<Brain className="w-6 h-6 text-purple-400" />}
            title="AI Summaries"
            description="Generate on-demand, executive-level summaries of any contributor's work or the whole repo."
          />
          <FeatureCard 
            icon={<Shield className="w-6 h-6 text-indigo-400" />}
            title="Repo Health Pulse"
            description="Monitor PR velocity, merge rates, and review depth instantly on a premium analysis board."
          />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="glass-card p-6 flex flex-col gap-4 group">
      <div className="p-3 rounded-xl bg-white/5 w-fit group-hover:bg-white/10 transition-colors">
        {icon}
      </div>
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}

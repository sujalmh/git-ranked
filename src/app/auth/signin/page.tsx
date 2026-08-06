import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { GithubIcon } from '@/components/icons/GithubIcon';
import { auth, signIn } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ShieldCheck, GitBranch, ArrowRight, Sparkles, Lock } from 'lucide-react';

export default async function SignInPage() {
  const session = await auth();
  if (session) {
    redirect('/dashboard');
  }

  const githubAppSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev';
  const installUrl = `https://github.com/apps/${githubAppSlug}/installations/new`;

  return (
    <div className="flex flex-col min-h-screen bg-black text-white relative">
      <Navbar />

      <main className="flex-1 w-full flex items-center justify-center px-4 py-12 sm:py-20 relative z-10">
        <div className="w-full max-w-md space-y-8">
          {/* Top Brand & Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/30 text-accent text-xs font-mono font-bold uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5" />
              AUTHENTICATION HUB
            </div>
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
              SIGN IN TO <span className="text-accent">GITRANKED</span>
            </h1>
            <p className="text-sm text-zinc-400 font-medium max-w-sm mx-auto">
              Access real-time developer impact scoring, repository health checks, and PR analytics.
            </p>
          </div>

          {/* Main Auth Card */}
          <div className="sleek-panel p-6 sm:p-8 space-y-6 bg-zinc-950 border-2 border-white/20">
            {/* Primary Action 1: GitHub OAuth Login */}
            <form
              action={async () => {
                'use server';
                await signIn('github', { redirectTo: '/dashboard' });
              }}
            >
              <button
                type="submit"
                className="w-full py-3.5 px-5 bg-white text-black hover:bg-accent hover:border-accent font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-3 cursor-pointer group shadow-[4px_4px_0_0_#ccff00]"
              >
                <GithubIcon className="w-5 h-5 fill-current" />
                <span>SIGN IN WITH GITHUB</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>

            <div className="relative flex items-center justify-center">
              <div className="w-full border-t border-zinc-800" />
              <span className="bg-zinc-950 px-3 text-xs font-mono font-bold uppercase text-zinc-500 shrink-0">
                OR CONNECT REPOS
              </span>
            </div>

            {/* Primary Action 2: GitHub App Installation */}
            <a
              href={installUrl}
              className="w-full py-3.5 px-5 accent-panel text-sm font-black uppercase tracking-wider flex items-center justify-center gap-3 cursor-pointer group text-center"
            >
              <GitBranch className="w-5 h-5 text-black" />
              <span>CONNECT GITHUB APP</span>
              <ExternalIcon className="w-4 h-4" />
            </a>

            {/* Trust & Security Badges */}
            <div className="pt-4 border-t border-zinc-800/80 grid grid-cols-2 gap-3 text-xs font-mono text-zinc-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>OAuth Secured</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#00ffff] shrink-0" />
                <span>Read-Only Access</span>
              </div>
            </div>
          </div>

          {/* Footer Subtext */}
          <p className="text-center text-xs text-zinc-500 font-mono">
            By signing in, you agree to our analytics policies.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

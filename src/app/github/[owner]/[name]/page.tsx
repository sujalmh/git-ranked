import { sql } from '@/lib/db';
import { getPublicRepository } from '@/lib/github-api';
import { notFound } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { GitBranch, Star, GitFork, AlertCircle, ArrowRight, Brain, Code } from 'lucide-react';
import Link from 'next/link';
import { fetchRepoEvents, getRepoAnalysisData } from '@/lib/analysis';
import { RepoAnalysisView } from '@/components/RepoAnalysisView';
import { formatDistanceToNow } from 'date-fns';

export default async function PublicRepoPage(
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const params = await props.params;
  const { owner, name } = params;

  // 1. Fetch public info to verify it exists and is public
  const githubRepo = await getPublicRepository(owner, name);
  if (!githubRepo) {
    notFound();
  }

  // 2. Check if it's tracked in GitRanked
  const repoQuery = await sql`
    SELECT id FROM repositories WHERE owner = ${owner} AND name = ${name} LIMIT 1
  `;

  let analysisData = null;
  let hasEvents = false;

  if (repoQuery.length > 0) {
    const repoId = repoQuery[0].id;
    const eventsQuery = await fetchRepoEvents(repoId);
    hasEvents = eventsQuery.length > 0;
    
    if (hasEvents) {
      analysisData = await getRepoAnalysisData(repoId);
    }
  }

  // Render full analysis if available
  if (analysisData && analysisData.isAnalysed) {
    return (
      <div className="flex flex-col min-h-screen relative bg-black text-white">
        <Navbar />
        
        {/* Public Banner */}
        <div className="w-full bg-[#ccff00] text-black py-3 px-6 text-center text-sm font-bold tracking-wide flex items-center justify-center gap-2">
          <Brain className="w-4 h-4" />
          You are viewing a public GitRanked analysis for {githubRepo.full_name}.
          <a
            href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
            className="underline underline-offset-4 decoration-black/30 hover:decoration-black transition-colors ml-2"
          >
            Analyze your own repositories
          </a>
        </div>

        <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-black flex items-center gap-2.5 mb-2 uppercase tracking-tighter">
              <GitBranch className="w-8 h-8 text-[#ccff00]" />
              {owner} / {name}
            </h1>
            <p className="text-zinc-400 max-w-3xl text-lg font-medium">
              {githubRepo.description || "Public repository AI insights and engineering metrics."}
            </p>
          </div>
          
          <RepoAnalysisView data={analysisData} readOnly={true} repoOwner={owner} repoName={name} />
          
          {/* Bottom CTA for public users */}
          <div className="mt-16 sleek-panel p-10 text-center border-[#ccff00]/20 bg-gradient-to-b from-transparent to-[#ccff00]/5">
            <h2 className="text-3xl font-black uppercase tracking-tighter mb-4">Want these insights for your team?</h2>
            <p className="text-zinc-400 mb-8 max-w-xl mx-auto font-medium">
              Join the engineering leaders using GitRanked to measure performance, identify bottlenecks, and recognize their top contributors.
            </p>
            <a
              href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#ccff00] text-black font-black uppercase tracking-wider hover:bg-white transition-colors"
            >
              Get Started Free <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </main>
      </div>
    );
  }

  // Render placeholder if not tracked or not analyzed
  return (
    <div className="flex flex-col min-h-screen relative bg-black text-white">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-16">
        <div className="sleek-panel p-10 relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#ccff00] opacity-5 blur-[100px] rounded-full pointer-events-none" />
          
          <div className="flex items-center gap-3 mb-6 relative z-10">
            <img src={githubRepo.owner.avatar_url} alt={githubRepo.owner.login} className="w-12 h-12 rounded-lg border border-white/10" />
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tighter">{githubRepo.full_name}</h1>
              <div className="text-zinc-500 font-medium text-sm flex items-center gap-4 mt-1">
                {githubRepo.language && (
                  <span className="flex items-center gap-1.5"><Code className="w-4 h-4" /> {githubRepo.language}</span>
                )}
                <span>Updated {formatDistanceToNow(new Date(githubRepo.updated_at), { addSuffix: true })}</span>
              </div>
            </div>
          </div>

          <p className="text-xl text-zinc-300 font-medium mb-10 leading-relaxed max-w-2xl relative z-10">
            {githubRepo.description || "No description provided."}
          </p>

          <div className="grid grid-cols-3 gap-4 mb-12 relative z-10">
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
              <Star className="w-6 h-6 text-amber-400 mx-auto mb-2" />
              <div className="text-2xl font-black">{githubRepo.stargazers_count.toLocaleString()}</div>
              <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mt-1">Stars</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
              <GitFork className="w-6 h-6 text-indigo-400 mx-auto mb-2" />
              <div className="text-2xl font-black">{githubRepo.forks_count.toLocaleString()}</div>
              <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mt-1">Forks</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
              <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <div className="text-2xl font-black">{githubRepo.open_issues_count.toLocaleString()}</div>
              <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mt-1">Issues</div>
            </div>
          </div>

          <div className="bg-black/50 border border-[#ccff00]/30 rounded-2xl p-8 text-center relative z-10">
            <Brain className="w-12 h-12 text-[#ccff00] mx-auto mb-4" />
            <h2 className="text-2xl font-black uppercase tracking-tight mb-3">AI Analysis Pending</h2>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              This repository has not been fully analyzed by GitRanked yet. Connect your GitHub account to generate deep engineering metrics, PR review stats, and contributor analytics.
            </p>
            <a
              href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#ccff00] text-black font-black uppercase tracking-wider hover:bg-white transition-colors"
            >
              Analyze this repository <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

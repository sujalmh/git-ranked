import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { GitBranch, ArrowRight, LayoutDashboard, Settings, Lock, Globe, ShieldCheck, Sparkles, ExternalLink } from 'lucide-react';
import { redirect } from 'next/navigation';
import { AddPublicRepo } from '@/components/AddPublicRepo';
import { RemoveRepoButton } from '@/components/RemoveRepoButton';
import { GithubIcon } from '@/components/icons/GithubIcon';

import { getRepoInsights, HealthMetrics } from '@/lib/insights';

type DashboardRepo = {
  id: number;
  owner: string;
  name: string;
  default_branch: string;
  added_at: string | Date;
  installation_status: string;
  event_count: number;
  healthMetrics?: HealthMetrics | null;
};

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  let repos: DashboardRepo[] = [];
  let installationCount = 0;

  try {
    const installRes = await sql`
      SELECT COUNT(*) as count FROM installations 
      WHERE linked_user_id = ${session.user.id} AND (status IS NULL OR status != 'deleted')
    `;
    installationCount = Number(installRes[0]?.count || 0);

    repos = (await sql`
      SELECT r.id, r.owner, r.name, r.default_branch, r.added_at,
             i.status as installation_status,
             (SELECT COUNT(*) FROM github_events WHERE repo_id = r.id) as event_count
      FROM repositories r
      LEFT JOIN installations i ON r.installation_id = i.id
      WHERE (i.linked_user_id = ${session.user.id} OR r.installation_id IS NULL)
        AND r.is_active = true
        AND (i.status IS NULL OR i.status != 'deleted')
      ORDER BY r.added_at DESC
    `) as DashboardRepo[];
    
    // Fetch insights in parallel for repos that have activity
    await Promise.all(repos.map(async (repo) => {
      if (repo.event_count === 0) return;
      try {
        repo.healthMetrics = await getRepoInsights(repo.id, false);
      } catch (err) {
        console.error(`Failed to fetch insights for repo ${repo.id}`, err);
      }
    }));
  } catch (error) {
    console.error('Failed to fetch repos:', error);
  }

  const githubAppSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev';
  const installUrl = `https://github.com/apps/${githubAppSlug}/installations/new`;

  return (
    <div className="flex flex-col min-h-screen relative bg-black text-white">
      <Navbar />
      
      <main className="flex-1 w-full px-6 md:px-12 py-8 space-y-12">
        {/* Page Title Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3">
              <LayoutDashboard className="w-8 h-8 text-[#ccff00]" />
              Your Repositories
            </h1>
            <p className="text-sm md:text-base font-medium text-zinc-400 mt-1">
              Track activity, compute scores, and generate AI insights for private and public projects.
            </p>
          </div>

          <a 
            href={installUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-colors self-start md:self-auto"
          >
            <Settings className="w-4 h-4 text-[#ccff00]" />
            <span>Manage App Access ({installationCount})</span>
          </a>
        </div>

        {/* 2-Column Section: Clear distinction between Private Repos vs Public Repos */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#ccff00]" />
            <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">
              Add Repositories To Track
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card A: Private / Personal Repositories */}
            <div className="p-6 rounded-2xl border-2 border-white/15 bg-zinc-950/90 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                      <Lock className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
                      PRIVATE & PERSONAL
                    </span>
                  </div>

                  {installationCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/30">
                      <ShieldCheck className="w-3.5 h-3.5" /> App Connected
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">
                    Add Private & Account Repositories
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Grant GitRanked GitHub App access to your personal account or organizations to track private commits, PR reviews, and team insights.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-black border border-zinc-800 text-xs font-mono space-y-2 text-zinc-300">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-bold text-[10px]">1</span>
                    <span>Click &quot;Connect GitHub App&quot; below</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-bold text-[10px]">2</span>
                    <span>Select personal or organization repositories</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-bold text-[10px]">3</span>
                    <span>Repository automatically syncs to your dashboard</span>
                  </div>
                </div>
              </div>

              <a
                href={installUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 rounded-xl bg-[#ccff00] hover:bg-[#b8e600] text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(204,255,0,0.15)]"
              >
                <GithubIcon className="w-4 h-4 fill-current" />
                <span>Connect Private Repositories</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Card B: Public Repository Search */}
            <div className="p-6 rounded-2xl border-2 border-white/15 bg-zinc-950/90 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                      <Globe className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-md border border-cyan-500/20">
                      PUBLIC REPOSITORIES
                    </span>
                  </div>

                  <span className="text-xs text-zinc-500 font-mono">Instant Search</span>
                </div>

                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">
                    Add Any Public Repository
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Search and analyze any public repository on GitHub instantly without installing the GitHub App.
                  </p>
                </div>
              </div>

              {/* Public Search Component */}
              <div className="w-full">
                <AddPublicRepo />
              </div>
            </div>
          </div>
        </div>

        {/* Tracked Repositories List */}
        <div className="space-y-6 pt-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-[#ccff00]" />
              Tracked Repositories ({repos.length})
            </h2>
            {repos.length > 0 && (
              <span className="text-xs text-zinc-500 font-mono">
                Click any repo card to view AI leaderboard & insights
              </span>
            )}
          </div>

          {repos.length === 0 ? (
            <div className="sleek-panel p-12 text-center flex flex-col items-center max-w-xl mx-auto my-8 border-2 border-white/20">
              <div className="w-14 h-14 bg-white/5 flex items-center justify-center mb-4 border border-white/20">
                <GitBranch className="w-7 h-7 text-[#ccff00]" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight mb-2 text-white">
                No Repositories Tracked Yet
              </h3>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Connect your private repositories using the GitHub App above or search for a public repository to start tracking developer impact.
              </p>
              <a 
                href={installUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-[#ccff00] text-black font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2"
              >
                <GithubIcon className="w-4 h-4 fill-current" />
                <span>Connect Private Repositories</span>
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {repos.map((repo) => (
                <Link 
                  href={`/repos/${repo.owner}/${repo.name}`} 
                  key={repo.id}
                  className="sleek-panel p-6 flex flex-col gap-4 group cursor-pointer border-2 border-white/10 hover:bg-[#ccff00] hover:border-[#ccff00] hover:text-black transition-all duration-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white/5 border border-white/20 group-hover:bg-black group-hover:border-black transition-colors shrink-0 flex items-center justify-center overflow-hidden">
                      <img
                        src={`https://github.com/${repo.owner}.png`}
                        alt={repo.owner}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-bold break-all text-white group-hover:text-black transition-colors">
                        {repo.owner} / {repo.name}
                      </h3>
                      <p className="text-xs font-medium text-zinc-500 group-hover:text-black/80 uppercase tracking-wider mt-0.5 transition-colors">
                        Branch: {repo.default_branch}
                      </p>
                    </div>
                    {repo.healthMetrics && repo.event_count > 0 ? (
                      <div className="text-right shrink-0">
                        <div className="text-3xl font-black text-accent group-hover:text-black leading-none transition-colors">
                          {repo.healthMetrics.overallScore}
                        </div>
                        <div className="text-[10px] font-bold uppercase text-zinc-500 group-hover:text-black/80 tracking-wider mt-1 transition-colors">
                          HEALTH
                        </div>
                      </div>
                    ) : repo.event_count === 0 ? (
                      <div className="text-right shrink-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-black bg-accent group-hover:bg-black group-hover:text-[#ccff00] px-2 py-1 transition-colors">
                          INITIALIZE
                        </div>
                      </div>
                    ) : null}
                    <RemoveRepoButton repoId={repo.id} repoName={`${repo.owner}/${repo.name}`} />
                  </div>
                  
                  <div className="mt-auto pt-4 border-t-2 border-white/10 group-hover:border-black/20 flex items-center justify-between transition-colors">
                    <span className="text-xs font-bold text-zinc-500 group-hover:text-black/80 uppercase tracking-wider transition-colors">
                      {repo.event_count > 0
                        ? `${repo.event_count} EVENTS`
                        : `ADDED ${new Date(repo.added_at).toLocaleDateString()}`}
                    </span>
                    <div className="flex items-center gap-2 text-accent group-hover:text-black text-sm font-bold uppercase tracking-wider group-hover:translate-x-1 transition-all">
                      {repo.event_count > 0 ? 'VIEW INSIGHTS' : 'SET UP'} <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

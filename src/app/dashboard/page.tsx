import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { GitBranch, ArrowRight, LayoutDashboard, Settings } from 'lucide-react';
import { redirect } from 'next/navigation';

import { getRepoInsights, HealthMetrics } from '@/lib/insights';

type DashboardRepo = {
  id: number;
  owner: string;
  name: string;
  default_branch: string;
  added_at: string | Date;
  installation_status: string;
  healthMetrics?: HealthMetrics | null;
};

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  let repos: DashboardRepo[] = [];
  try {
    repos = (await sql`
      SELECT r.id, r.owner, r.name, r.default_branch, r.added_at, i.status as installation_status
      FROM repositories r
      JOIN installations i ON r.installation_id = i.id
      WHERE i.linked_user_id = ${session.user.id} AND r.is_active = true
      ORDER BY r.added_at DESC
    `) as DashboardRepo[];
    
    // Fetch insights in parallel for all repos
    await Promise.all(repos.map(async (repo) => {
      try {
        repo.healthMetrics = await getRepoInsights(repo.id, false);
      } catch (err) {
        console.error(`Failed to fetch insights for repo ${repo.id}`, err);
      }
    }));
  } catch (error) {
    console.error('Failed to fetch repos:', error);
  }

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5 mb-1">
              <LayoutDashboard className="w-6 h-6 text-indigo-400" />
              Your Repositories
            </h1>
            <p className="text-sm text-zinc-400">Track activity, compute scores, and generate AI insights.</p>
          </div>
          <a 
            href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
            className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 font-medium transition-colors border border-white/5 flex items-center gap-2 text-sm"
          >
            <Settings className="w-4 h-4" /> Manage Installations
          </a>
        </div>

        {repos.length === 0 ? (
          <div className="glass-card p-8 text-center flex flex-col items-center max-w-xl mx-auto mt-12">
            <div className="w-14 h-14 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 border border-indigo-500/20">
              <GitBranch className="w-7 h-7 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">No Repositories Tracked Yet</h2>
            <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
              Install the GitRanked GitHub App on your repositories to start tracking commits, PRs, and reviews.
            </p>
            <a 
              href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-all shadow-lg shadow-indigo-500/20"
            >
              Install GitHub App
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {repos.map(repo => (
              <Link 
                href={`/repos/${repo.owner}/${repo.name}`} 
                key={repo.id}
                className="glass-card p-5 flex flex-col gap-3 group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-zinc-800/50 border border-white/5">
                    <GitBranch className="w-4 h-4 text-zinc-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold truncate">{repo.owner} / {repo.name}</h3>
                    <p className="text-xs text-zinc-500 truncate">Default branch: {repo.default_branch}</p>
                  </div>
                  {repo.healthMetrics && (
                    <div className="text-right shrink-0">
                      <div className="text-lg font-black text-indigo-400 leading-none">{repo.healthMetrics.overallScore}</div>
                      <div className="text-[10px] uppercase text-zinc-500 tracking-wider">Health</div>
                    </div>
                  )}
                </div>
                
                <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    Added {new Date(repo.added_at).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1 text-indigo-400 text-sm font-medium group-hover:translate-x-1 transition-transform">
                    View Insights <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

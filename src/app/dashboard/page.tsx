import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { GitBranch, ArrowRight, LayoutDashboard, Settings } from 'lucide-react';
import { redirect } from 'next/navigation';
import { AddPublicRepo } from '@/components/AddPublicRepo';
import { RemoveRepoButton } from '@/components/RemoveRepoButton';

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
  try {
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

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      
      <main className="flex-1 w-full px-6 md:px-12 py-8">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-4 mb-2">
              <LayoutDashboard className="w-8 h-8 text-accent" />
              Your Repositories
            </h1>
            <p className="text-lg font-medium text-zinc-400">Track activity, compute scores, and generate AI insights.</p>
          </div>
          <a 
            href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
            className="px-5 py-2 accent-panel text-sm flex items-center gap-2 uppercase tracking-wider"
          >
            <Settings className="w-4 h-4" /> MANAGE INSTALLATIONS
          </a>
        </div>

        <AddPublicRepo />

        {repos.length === 0 ? (
          <div className="sleek-panel p-12 text-center flex flex-col items-center max-w-2xl mx-auto mt-12 border-2 border-white/20">
            <div className="w-16 h-16 rounded-none bg-white/5 flex items-center justify-center mb-6 border-2 border-white/20">
              <GitBranch className="w-8 h-8 text-accent" />
            </div>
            <h2 className="text-3xl font-black uppercase tracking-tighter mb-4">No Repositories Tracked Yet</h2>
            <p className="text-lg font-medium text-zinc-400 mb-8 max-w-lg mx-auto">
              Install the GitRanked GitHub App on your repositories to start tracking commits, PRs, and reviews.
            </p>
            <a 
              href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
              className="px-8 py-3 accent-panel text-sm tracking-wider uppercase"
            >
              INSTALL GITHUB APP
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {repos.map(repo => (
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
                    <h3 className="text-lg font-bold break-all text-white group-hover:text-black transition-colors">{repo.owner} / {repo.name}</h3>
                    <p className="text-xs font-medium text-zinc-500 group-hover:text-black/80 uppercase tracking-wider mt-0.5 transition-colors">Branch: {repo.default_branch}</p>
                  </div>
                  {repo.healthMetrics && repo.event_count > 0 ? (
                    <div className="text-right shrink-0">
                      <div className="text-3xl font-black text-accent group-hover:text-black leading-none transition-colors">{repo.healthMetrics.overallScore}</div>
                      <div className="text-[10px] font-bold uppercase text-zinc-500 group-hover:text-black/80 tracking-wider mt-1 transition-colors">HEALTH</div>
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
      </main>
    </div>
  );
}

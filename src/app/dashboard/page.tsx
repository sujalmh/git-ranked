import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import Image from 'next/image';
import { GitBranch, ArrowRight, LayoutDashboard, Settings } from 'lucide-react';
import { redirect } from 'next/navigation';
import { RemoveRepoButton } from '@/components/RemoveRepoButton';
import { AddRepoModal } from '@/components/AddRepoModal';

import { getRepoInsightsBatch, HealthMetrics } from '@/lib/insights';

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
      WHERE (i.linked_user_id = ${session.user.id} OR r.added_by_user_id = ${session.user.id})
        AND r.is_active = true
        AND (i.status IS NULL OR i.status != 'deleted')
      ORDER BY r.added_at DESC
    `) as DashboardRepo[];
    
    // Fetch cached health metrics for all repos in a single batched query
    // (avoid N+1 queries per repo).
    const repoIdsWithActivity = repos.filter((r) => r.event_count > 0).map((r) => r.id);
    if (repoIdsWithActivity.length > 0) {
      try {
        const batch = await getRepoInsightsBatch(repoIdsWithActivity);
        for (const repo of repos) {
          const metrics = batch.get(repo.id);
          if (metrics) repo.healthMetrics = metrics;
        }
      } catch (err) {
        console.error('Failed to fetch insights for repos:', err);
      }
    }
  } catch (error) {
    console.error('Failed to fetch repos:', error);
  }

  const githubAppSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev';
  const installUrl = `https://github.com/apps/${githubAppSlug}/installations/new`;

  return (
    <div className="flex flex-col min-h-screen relative bg-black text-white">
      <Navbar />
      
      <main className="flex-1 w-full px-4 sm:px-6 md:px-12 py-6 sm:py-8 space-y-8">
        {/* Clean Dashboard Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3">
              <LayoutDashboard className="w-7 h-7 sm:w-8 sm:h-8 text-accent" />
              Your Repositories
            </h1>
            <p className="text-xs sm:text-sm md:text-base font-medium text-zinc-400 mt-1">
              Track activity, compute scores, and generate AI insights for private and public projects.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 self-start md:self-auto w-full sm:w-auto">
            {/* Primary "+ Add Repository" Modal Button */}
            <AddRepoModal installationCount={installationCount} installUrl={installUrl} />

            {/* Manage Installations Link */}
            <a 
              href={installUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-colors shrink-0"
              title="Manage GitHub App Installations"
            >
              <Settings className="w-4 h-4 text-accent" />
              <span>Manage App ({installationCount})</span>
            </a>
          </div>
        </div>

        {/* Tracked Repositories Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-accent" />
              Tracked Repositories ({repos.length})
            </h2>
            {repos.length > 0 && (
              <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
                Click any repo card to view AI leaderboard & insights
              </span>
            )}
          </div>

          {repos.length === 0 ? (
            <div className="sleek-panel p-12 text-center flex flex-col items-center max-w-xl mx-auto my-12 border-2 border-white/20">
              <div className="w-14 h-14 bg-white/5 flex items-center justify-center mb-4 border border-white/20">
                <GitBranch className="w-7 h-7 text-accent" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight mb-2 text-white">
                No Repositories Tracked Yet
              </h3>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Connect your private repositories using the GitHub App or search for any public repository to start tracking developer impact.
              </p>
              <AddRepoModal installationCount={installationCount} installUrl={installUrl} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {repos.map((repo) => (
                <Link 
                  href={`/repos/${repo.owner}/${repo.name}`} 
                  key={repo.id}
                  className="sleek-panel p-6 flex flex-col gap-4 group cursor-pointer border-2 border-white/10 hover:bg-accent hover:border-accent hover:text-black transition-all duration-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white/5 border border-white/20 group-hover:bg-black group-hover:border-black transition-colors shrink-0 flex items-center justify-center overflow-hidden">
                      <Image
                        src={`https://github.com/${repo.owner}.png`}
                        alt={repo.owner}
                        width={40}
                        height={40}
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
                        <div className="text-[10px] font-bold uppercase tracking-wider text-black bg-accent group-hover:bg-black group-hover:text-accent px-2 py-1 transition-colors">
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

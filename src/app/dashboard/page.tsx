import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { GitBranch, ArrowRight, LayoutDashboard, Settings } from 'lucide-react';
import { redirect } from 'next/navigation';

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  let repos: any[] = [];
  try {
    repos = await sql`
      SELECT r.id, r.owner, r.name, r.default_branch, r.added_at, i.status as installation_status
      FROM repositories r
      JOIN installations i ON r.installation_id = i.id
      WHERE i.app_user_id = ${session.user.id} AND r.is_active = true
      ORDER BY r.added_at DESC
    `;
  } catch (error) {
    console.error('Failed to fetch repos:', error);
  }

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 mt-8">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
              <LayoutDashboard className="w-8 h-8 text-indigo-400" />
              Your Repositories
            </h1>
            <p className="text-zinc-400">Track activity, compute scores, and generate AI insights.</p>
          </div>
          <a 
            href="/api/auth/signin?callbackUrl=/install"
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 font-medium transition-colors border border-white/5 flex items-center gap-2 text-sm"
          >
            <Settings className="w-4 h-4" /> Manage Installations
          </a>
        </div>

        {repos.length === 0 ? (
          <div className="glass-card p-12 text-center flex flex-col items-center max-w-2xl mx-auto mt-20">
            <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center mb-6 border border-indigo-500/20">
              <GitBranch className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold mb-4">No Repositories Tracked Yet</h2>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              Install the GitRanked GitHub App on your repositories to start tracking commits, PRs, and reviews.
            </p>
            <a 
              href="/api/auth/signin?callbackUrl=/install"
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-all shadow-lg shadow-indigo-500/20"
            >
              Install GitHub App
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {repos.map(repo => (
              <Link 
                href={`/repos/${repo.owner}/${repo.name}`} 
                key={repo.id}
                className="glass-card p-6 flex flex-col gap-4 group cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-zinc-800/50 border border-white/5">
                    <GitBranch className="w-5 h-5 text-zinc-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold truncate">{repo.owner} / {repo.name}</h3>
                    <p className="text-xs text-zinc-500 truncate">Default branch: {repo.default_branch}</p>
                  </div>
                </div>
                
                <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    Added {new Date(repo.added_at).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1 text-indigo-400 text-sm font-medium group-hover:translate-x-1 transition-transform">
                    Analyze <ArrowRight className="w-4 h-4" />
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

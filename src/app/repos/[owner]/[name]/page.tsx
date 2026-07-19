import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import { getRepoInsights } from '@/lib/insights';
import Link from 'next/link';
import Image from 'next/image';
import { GitBranch, Activity, GitPullRequest, Users, ArrowRight } from 'lucide-react';
import { redirect } from 'next/navigation';

export default async function RepoAnalysisBoard(
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  const { owner, name } = params;

  const repoQuery = await sql`
    SELECT r.id, r.github_repo_id 
    FROM repositories r
    JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name} AND i.linked_user_id = ${session.user.id}
  `;

  if (repoQuery.length === 0) {
    return <div>Repository not found or access denied.</div>;
  }

  const repoId = repoQuery[0].id;
  const insights = await getRepoInsights(repoId);

  // Since it's a server component, I will query DB for scores directly to avoid auth proxy issues.
  const eventsQuery = await sql`
    SELECT e.event_type as type, e.payload, e.created_at, c.id as contributor_id, c.username, c.avatar_url
    FROM github_events e
    JOIN github_contributors c ON e.contributor_id = c.id
    WHERE e.repo_id = ${repoId}
  `;

  // Avoid circular import issues by redefining or importing
  // I will just display the basic raw data for now and let the client component handle charts if needed.
  
  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 mt-8">
        <div className="mb-12 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
              <GitBranch className="w-8 h-8 text-indigo-400" />
              {owner} / {name}
            </h1>
            <p className="text-zinc-400">Analysis Board & Insights</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="glass-card p-6 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-indigo-400 mb-2">
              <Activity className="w-5 h-5" />
              <h3 className="font-semibold text-white">Active Contributors</h3>
            </div>
            <div className="text-4xl font-bold">{insights.activeContributors}</div>
            <p className="text-sm text-zinc-400">In the last 30 days</p>
          </div>

          <div className="glass-card p-6 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-pink-400 mb-2">
              <GitPullRequest className="w-5 h-5" />
              <h3 className="font-semibold text-white">PR Health</h3>
            </div>
            <div className="text-4xl font-bold">{insights.prHealth.mergeRate}%</div>
            <p className="text-sm text-zinc-400">
              {insights.prHealth.merged} merged / {insights.prHealth.opened} opened
            </p>
          </div>

          <div className="glass-card p-6 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-purple-400 mb-2">
              <Users className="w-5 h-5" />
              <h3 className="font-semibold text-white">Total Events</h3>
            </div>
            <div className="text-4xl font-bold">{eventsQuery.length}</div>
            <p className="text-sm text-zinc-400">All time tracked</p>
          </div>
        </div>
        
        {/* We would render PulseChart and ScoreBoard client components here */}
        <div className="glass-card p-6 mb-12">
           <h2 className="text-xl font-bold mb-4">Contributors Leaderboard</h2>
           <p className="text-zinc-400">Navigate to contributor page for deeper AI insights.</p>
           {/* Fallback for now */}
           <div className="mt-4 flex flex-col gap-4">
             {Array.from(new Set(eventsQuery.map(e => e.username))).map(username => {
               const cEvents = eventsQuery.filter(e => e.username === username);
               const avatarUrl = cEvents[0]?.avatar_url;
               return (
                 <Link href={`/repos/${owner}/${name}/${username}`} key={username} className="p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      {typeof avatarUrl === 'string' && avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          className="w-10 h-10 rounded-full"
                          alt={`${username} avatar`}
                          width={40}
                          height={40}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-white/10" />
                      )}
                      <span className="font-bold">{username}</span>
                      <span className="text-zinc-500 text-sm">{cEvents.length} events</span>
                    </div>
                    <ArrowRight className="w-5 h-5 text-indigo-400 group-hover:translate-x-1 transition-transform" />
                 </Link>
               )
             })}
           </div>
        </div>

      </main>
    </div>
  );
}

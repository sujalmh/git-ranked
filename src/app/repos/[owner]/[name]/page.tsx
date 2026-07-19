import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { GitBranch, Brain } from 'lucide-react';
import { redirect } from 'next/navigation';
import { backfillRepoActivity } from '@/lib/github-backfill';
import { AnalyseButton } from '@/components/AnalyseButton';
import { RepoAnalysisView } from '@/components/RepoAnalysisView';
import { ShareButton } from '@/components/ShareButton';
import { fetchRepoEvents, getRepoAnalysisData } from '@/lib/analysis';
import { getShareState } from '@/lib/share';

export default async function RepoAnalysisBoard(
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { owner, name } = params;

  const repoQuery = await sql`
    SELECT r.id, r.github_repo_id, r.default_branch, i.github_installation_id
    FROM repositories r
    JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name} AND i.linked_user_id = ${session.user.id}
  `;

  if (repoQuery.length === 0) return <div>Repository not found or access denied.</div>;

  const repoId = repoQuery[0].id;
  let eventsQuery = await fetchRepoEvents(repoId);

  if (eventsQuery.length === 0) {
    await backfillRepoActivity({
      id: repoQuery[0].id,
      github_installation_id: repoQuery[0].github_installation_id,
      owner,
      name,
    });

    eventsQuery = await fetchRepoEvents(repoId);
  }

  const data = await getRepoAnalysisData(repoId);
  const shareState = await getShareState(repoId);
  const shareUrl = shareState.token
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/shared/${shareState.token}`
    : null;

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
              <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
              <span className="text-zinc-600">/</span>
              <span>{owner}</span>
            </div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5 mb-1">
              <GitBranch className="w-6 h-6 text-indigo-400" />
              {owner} / {name}
            </h1>
            <p className="text-sm text-zinc-400 max-w-2xl">
              AI Engineering Intelligence: Understand what shipped, where bottlenecks are, and how your team collaborates.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AnalyseButton owner={owner} name={name} isReanalyse={data.isAnalysed} />
            <ShareButton
              owner={owner}
              name={name}
              initialEnabled={shareState.enabled}
              initialUrl={shareState.enabled ? shareUrl : null}
            />
            <Link href={`/repos/${owner}/${name}/releases`} className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors px-3.5 py-2 text-sm text-white font-medium">
              Release Notes
            </Link>
            <Link href={`/repos/${owner}/${name}/compare`} className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors px-3.5 py-2 text-sm text-white font-medium">
              Compare Team
            </Link>
          </div>
        </div>

        {!data.isAnalysed && data.contributors.length > 0 ? (
          <div className="glass-card p-8 text-center max-w-2xl mx-auto mt-12 flex flex-col items-center">
            <Brain className="w-10 h-10 text-indigo-400 mb-3" />
            <h2 className="text-xl font-bold mb-2">Repository Insights Not Generated</h2>
            <p className="text-sm text-zinc-400 leading-relaxed mb-5 max-w-lg">
              This repository has contribution data, but the AI insights have not been generated yet. Click below to crunch the data and generate comprehensive health metrics, team summaries, and AI impact scores.
            </p>
            <AnalyseButton owner={owner} name={name} />
          </div>
        ) : (
          <RepoAnalysisView data={data} readOnly={false} />
        )}
      </main>
    </div>
  );
}

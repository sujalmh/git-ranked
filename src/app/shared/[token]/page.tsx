import Link from 'next/link';
import { GitBranch, ShieldCheck, ArrowLeft } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { RepoAnalysisView } from '@/components/RepoAnalysisView';
import { fetchRepoEvents, getRepoAnalysisData } from '@/lib/analysis';
import { getRepoByShareToken } from '@/lib/share';
import { getPublicRepository } from '@/lib/github-api';

export default async function SharedRepoAnalysis(
  props: { params: Promise<{ token: string }> }
) {
  const { token } = await props.params;

  const repo = await getRepoByShareToken(token);
  if (!repo) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 max-w-3xl mx-auto w-full px-6 mt-12 text-center">
          <div className="sleek-panel p-8">
            <h1 className="text-xl font-bold mb-2">Link invalid or sharing disabled</h1>
            <p className="text-sm text-zinc-400 mb-5 max-w-md mx-auto">
              This share link is no longer valid. The repository owner may have revoked it.
            </p>
            <Link href="/" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-black hover:bg-white transition-colors font-semibold text-sm">
              <ArrowLeft className="w-4 h-4" /> Go home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const repoId = repo.id;
  await fetchRepoEvents(repoId);
  const data = await getRepoAnalysisData(repoId, { computeScores: false });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const canonicalUrl = `${appUrl}/repos/${repo.owner}/${repo.name}`;
  const githubRepo = await getPublicRepository(repo.owner, repo.name);
  const repoDescription = githubRepo?.description || 'AI Engineering Intelligence: Understand what shipped, where bottlenecks are, and how your team collaborates.';

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      <main className="flex-1 w-full px-6 py-8">
        <div className="mb-4 flex items-center gap-2 text-xs text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 max-w-fit">
          <ShieldCheck className="w-3.5 h-3.5" />
          Shared read-only view — analysis cannot be triggered or modified here.
        </div>

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
              <Link href={canonicalUrl} className="hover:text-white transition-colors">View on GitRanked</Link>
            </div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5 mb-1">
              <GitBranch className="w-6 h-6 text-accent" />
              {repo.owner} / {repo.name}
            </h1>
            <p className="text-base text-zinc-400 max-w-2xl">
              {repoDescription}
            </p>
          </div>
        </div>

        <RepoAnalysisView data={data} readOnly repoOwner={repo.owner} repoName={repo.name} />
      </main>
    </div>
  );
}

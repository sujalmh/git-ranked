import { sql } from '@/lib/db';
import { getPublicRepositoryCached } from '@/lib/github-api';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Navbar } from '@/components/Navbar';
import { auth } from '@/lib/auth';
import { getUserRepoId } from '@/lib/repo-access';
import { Star, GitFork, AlertCircle, ArrowRight, Brain, Code, Calendar } from 'lucide-react';
import { fetchRepoEvents, getRepoAnalysisData, getRepoAnalysisPeriod } from '@/lib/analysis';
import { RepoAnalysisView } from '@/components/RepoAnalysisView';
import { ShareButton } from '@/components/ShareButton';
import { AnalyseButton } from '@/components/AnalyseButton';
import { formatDistanceToNow } from 'date-fns';

export default async function PublicRepoPage(
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const params = await props.params;
  const { owner, name } = params;
  const session = await auth();
  const installUrl = `https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`;

  // 1. Fetch public info to verify it exists and is public (deduped with the
  // layout's generateMetadata via React cache).
  const githubRepo = await getPublicRepositoryCached(owner, name);
  if (!githubRepo) {
    notFound();
  }

  // 2. Check if it's tracked in GitRanked. Only public (non-installation) repos
  // or repos explicitly shared by their owner get a public showcase page —
  // installation-tracked repos may be private and must not be exposed.
  const repoQuery = await sql`
    SELECT id FROM repositories
    WHERE owner = ${owner} AND name = ${name}
      AND (installation_id IS NULL OR share_enabled = true)
      AND is_active = true
    LIMIT 1
  `;

  // 3. Determine whether the signed-in user owns this repo so the public
  // placeholder can start analysis directly instead of redirecting to the
  // GitHub App install page.
  const isOwner = !!session?.user?.id && (await getUserRepoId(owner, name, session.user.id)) !== null;

  let analysisData = null;
  let hasEvents = false;

  let periodText = '';
  if (repoQuery.length > 0) {
    const repoId = repoQuery[0].id;
    const eventsQuery = await fetchRepoEvents(repoId);
    hasEvents = eventsQuery.length > 0;

    if (hasEvents) {
      analysisData = await getRepoAnalysisData(repoId, { computeScores: false });
    }
    periodText = (await getRepoAnalysisPeriod(repoId)).periodText;
  }

  // Render full analysis if available
  if (analysisData && analysisData.isAnalysed) {
    return (
      <div className="flex flex-col min-h-screen relative bg-black text-white">
        <Navbar />

        {/* Public Banner */}
        <div className="w-full bg-accent text-black py-3 px-6 text-center text-sm font-bold tracking-wide flex items-center justify-center gap-2">
          <Brain className="w-4 h-4" />
          You are viewing a public GitRanked analysis for {githubRepo.full_name}.
          <a
            href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
            className="underline underline-offset-4 decoration-black/30 hover:decoration-black transition-colors ml-2"
          >
            Analyze your own repositories
          </a>
        </div>

        <main className="flex-1 w-full px-4 sm:px-6 py-6 sm:py-8">
          <div className="mb-8">
            <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
              <Link href="/showcase" className="hover:text-white transition-colors">Showcase</Link>
              <span className="text-zinc-600">/</span>
              <span>{owner}</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
              <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-3 tracking-tighter text-white min-w-0 break-all">
                <Image
                  src={`https://github.com/${owner}.png`}
                  alt={owner}
                  width={36}
                  height={36}
                  className="w-8 h-8 sm:w-9 sm:h-9 border-2 border-white/20 object-cover shrink-0"
                />
                <span>{owner} / {name}</span>
              </h1>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-none bg-white/5 border border-white/10 text-xs font-semibold text-zinc-300 shrink-0 self-start sm:self-auto">
                <Calendar className="w-3.5 h-3.5 text-accent" />
                <span>Analysis Period: 30 Days ({periodText})</span>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-3">
              <p className="text-sm sm:text-base text-zinc-400 max-w-2xl">
                {githubRepo.description || "Public repository AI insights and engineering metrics."}
              </p>
              <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
                <ShareButton
                  owner={owner}
                  name={name}
                  initialEnabled={true}
                  initialUrl={`/github/${owner}/${name}`}
                  isStatic={true}
                />
                <a
                  href={installUrl}
                  className="rounded-none border border-white/10 bg-white/5 hover:bg-white/10 transition-colors px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base text-white font-semibold flex items-center justify-center"
                >
                  Analyze your own repository
                </a>
              </div>
            </div>
          </div>

          <RepoAnalysisView data={analysisData} readOnly={true} repoOwner={owner} repoName={name} />

          {/* Bottom CTA for public users */}
          <div className="mt-16 sleek-panel p-10 text-center border-accent/20 bg-gradient-to-b from-transparent to-accent/5">
            <h2 className="text-3xl font-black uppercase tracking-tighter mb-4">Want these insights for your team?</h2>
            <p className="text-zinc-400 mb-8 max-w-xl mx-auto font-medium">
              Join the engineering leaders using GitRanked to measure performance, identify bottlenecks, and recognize their top contributors.
            </p>
            <a
              href={installUrl}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-accent text-black font-black uppercase tracking-wider hover:bg-white transition-colors"
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
      <main className="flex-1 w-full px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
            <Link href="/showcase" className="hover:text-white transition-colors">Showcase</Link>
            <span className="text-zinc-600">/</span>
            <span>{owner}</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-3 tracking-tighter text-white min-w-0 break-all">
              <Image src={githubRepo.owner.avatar_url} alt={githubRepo.owner.login} width={36} height={36} className="w-8 h-8 sm:w-9 sm:h-9 border-2 border-white/20 object-cover rounded-full shrink-0" />
              <span>{owner} / {name}</span>
            </h1>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-none bg-white/5 border border-white/10 text-xs font-semibold text-zinc-300 shrink-0 self-start sm:self-auto">
              <Calendar className="w-3.5 h-3.5 text-accent" />
              <span>Analysis Period: 30 Days ({periodText || '—'})</span>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-3">
            <p className="text-sm sm:text-base text-zinc-400 max-w-2xl">
              {githubRepo.description || "No description provided."}
            </p>
            <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
              <ShareButton
                owner={owner}
                name={name}
                initialEnabled={true}
                initialUrl={`/github/${owner}/${name}`}
                isStatic={true}
              />
            </div>
          </div>
        </div>

        <div className="sleek-panel p-10 relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent opacity-5 blur-[100px] rounded-full pointer-events-none" />

          <div className="flex items-center gap-3 mb-6 relative z-10">
            <Image src={githubRepo.owner.avatar_url} alt={githubRepo.owner.login} width={48} height={48} className="w-12 h-12 rounded-lg border border-white/10" />
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

          <div className="grid grid-cols-3 gap-4 mb-12 relative z-10">
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
              <Star className="w-6 h-6 text-amber-400 mx-auto mb-2" />
              <div className="text-2xl font-black">{githubRepo.stargazers_count.toLocaleString()}</div>
              <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mt-1">Stars</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
              <GitFork className="w-6 h-6 text-accent mx-auto mb-2" />
              <div className="text-2xl font-black">{githubRepo.forks_count.toLocaleString()}</div>
              <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mt-1">Forks</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
              <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <div className="text-2xl font-black">{githubRepo.open_issues_count.toLocaleString()}</div>
              <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mt-1">Issues</div>
            </div>
          </div>

          <div className="bg-black/50 border border-accent/30 rounded-2xl p-8 text-center relative z-10">
            <Brain className="w-12 h-12 text-accent mx-auto mb-4" />
            <h2 className="text-2xl font-black uppercase tracking-tight mb-3">AI Analysis Pending</h2>
            {isOwner ? (
              <p className="text-zinc-400 mb-8 max-w-md mx-auto">
                This repository is listed on the showcase but has not been fully analyzed yet. Run the analysis below to generate deep engineering metrics, PR review stats, and contributor analytics.
              </p>
            ) : (
              <p className="text-zinc-400 mb-8 max-w-md mx-auto">
                This repository has not been fully analyzed by GitRanked yet. Connect your GitHub account to generate deep engineering metrics, PR review stats, and contributor analytics.
              </p>
            )}
            {isOwner ? (
              hasEvents ? (
                <div className="flex flex-col items-center gap-3">
                  <AnalyseButton owner={owner} name={name} />
                  <Link
                    href={`/repos/${owner}/${name}`}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white/5 border border-white/10 text-white font-bold uppercase tracking-wider hover:bg-white/10 transition-colors text-xs"
                  >
                    Open Analysis Dashboard <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              ) : (
                <Link
                  href={`/repos/${owner}/${name}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-accent text-black font-black uppercase tracking-wider hover:bg-white transition-colors"
                >
                  Open Analysis Dashboard <ArrowRight className="w-5 h-5" />
                </Link>
              )
            ) : (
              <a
                href={installUrl}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-accent text-black font-black uppercase tracking-wider hover:bg-white transition-colors"
              >
                Analyze this repository <ArrowRight className="w-5 h-5" />
              </a>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

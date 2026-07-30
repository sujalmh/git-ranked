import { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { sql } from '@/lib/db';
import Link from 'next/link';
import { GitBranch, Star, ArrowRight, Award, Code2, AlertCircle, PlusCircle } from 'lucide-react';
import { getPublicRepository } from '@/lib/github-api';
import { fetchRepoEvents, getRepoAnalysisData } from '@/lib/analysis';

export const metadata: Metadata = {
  title: 'Public Open-Source Repositories Showcase | GitRanked',
  description: 'Explore active open-source GitHub repositories analyzed on GitRanked with real aggregated health metrics, contributor impact scores, and PR cycle times.',
};

export const revalidate = 60; // Revalidate every minute so newly added public repos show up promptly

type ShowcaseRepo = {
  id: string;
  owner: string;
  name: string;
  description: string;
  stars: string;
  lang: string;
  score: number | null;
  isAnalyzed: boolean;
};

export default async function ShowcasePage() {
  const showcaseList: ShowcaseRepo[] = [];

  try {
    // Strictly fetch active public repositories tracked in the database
    const dbRepos = await sql`
      SELECT id, owner, name
      FROM repositories
      WHERE is_active = true AND (installation_id IS NULL OR share_enabled = true)
      ORDER BY added_at DESC
      LIMIT 48
    `;

    for (const repo of dbRepos) {
      const events = await fetchRepoEvents(repo.id);
      let realScore: number | null = null;
      let isAnalyzed = false;

      if (events.length > 0) {
        const analysis = await getRepoAnalysisData(repo.id);
        if (analysis && analysis.isAnalysed && analysis.healthMetrics?.overallScore !== undefined) {
          realScore = Math.round(analysis.healthMetrics.overallScore);
          isAnalyzed = true;
        }
      }

      // Fetch live GitHub metadata
      const githubInfo = await getPublicRepository(repo.owner, repo.name);

      showcaseList.push({
        id: repo.id,
        owner: repo.owner,
        name: repo.name,
        description: githubInfo?.description || 'Public GitHub repository tracked on GitRanked.',
        stars: githubInfo?.stargazers_count !== undefined
          ? githubInfo.stargazers_count >= 1000
            ? `${(githubInfo.stargazers_count / 1000).toFixed(1)}k`
            : `${githubInfo.stargazers_count}`
          : '—',
        lang: githubInfo?.language || 'Code',
        score: realScore,
        isAnalyzed,
      });
    }
  } catch (err) {
    console.error('Error fetching database repos for showcase:', err);
  }

  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <Navbar />
      <main className="flex-1 w-full px-6 md:px-12 lg:px-16 py-12">
        {/* Header */}
        <div className="text-left max-w-4xl mb-16">
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tighter leading-[0.95] mb-6">
            PUBLIC REPOSITORIES <span className="text-[#ccff00]">SHOWCASE</span>.
          </h1>
          <p className="text-base sm:text-lg lg:text-xl text-zinc-400 font-medium leading-relaxed">
            Real-time engineering metrics, code review velocity, and contributor impact scores across public repositories tracked on GitRanked.
          </p>
        </div>

        {/* Repository Showcase Grid */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight flex items-center gap-2 text-white">
              <Award className="w-7 h-7 text-[#ccff00]" /> Tracked Repositories ({showcaseList.length})
            </h2>
          </div>

          {showcaseList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full">
              {showcaseList.map((repo) => (
                <Link
                  key={repo.id}
                  href={`/github/${repo.owner}/${repo.name}`}
                  className="sleek-panel p-6 hover:border-[#ccff00]/50 transition-all group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 font-bold uppercase tracking-tight text-white group-hover:text-[#ccff00] transition-colors truncate text-base">
                        <GitBranch className="w-4 h-4 text-[#ccff00] shrink-0" />
                        <span className="truncate">{repo.owner} / {repo.name}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-bold text-amber-400 shrink-0">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        {repo.stars}
                      </div>
                    </div>

                    <p className="text-sm text-zinc-400 leading-relaxed mb-6 font-medium line-clamp-2">
                      {repo.description}
                    </p>
                  </div>

                  <div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4 flex items-center justify-between text-xs font-bold">
                      <span className="text-zinc-400 uppercase tracking-wider">GitRanked Health Score</span>
                      {repo.isAnalyzed && repo.score !== null ? (
                        <span className="text-[#ccff00] text-sm">{repo.score} / 100</span>
                      ) : (
                        <span className="text-zinc-500 font-normal italic flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-amber-500/80" /> Analysis Pending
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs font-bold uppercase tracking-wider text-zinc-300">
                      <span className="flex items-center gap-1">
                        <Code2 className="w-3.5 h-3.5 text-zinc-400" /> {repo.lang}
                      </span>
                      <span className="text-[#ccff00] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        {repo.isAnalyzed ? 'View Insights' : 'Analyze Repo'} &rarr;
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="sleek-panel p-12 text-center max-w-xl mx-auto my-8">
              <PlusCircle className="w-12 h-12 text-[#ccff00] mx-auto mb-4" />
              <h3 className="text-2xl font-black uppercase tracking-tight text-white mb-2">No Public Repositories Tracked Yet</h3>
              <p className="text-zinc-400 text-sm mb-6">
                Be the first to analyze a public open-source GitHub repository on GitRanked.
              </p>
              <a
                href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#ccff00] text-black font-black uppercase tracking-wider hover:bg-white transition-colors text-xs"
              >
                Track a Public Repository
              </a>
            </div>
          )}
        </section>

        {/* CTA Banner */}
        <section className="sleek-panel p-10 sm:p-16 text-center border-[#ccff00]/30 bg-gradient-to-b from-transparent to-[#ccff00]/5 max-w-5xl mx-auto my-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black uppercase tracking-tighter mb-4">Want your repository listed here?</h2>
          <p className="text-base sm:text-lg text-zinc-400 mb-8 max-w-xl mx-auto font-medium leading-relaxed">
            Connect your public GitHub repository to analyze PR review times, engineering velocity, and contributor impact scores.
          </p>
          <a
            href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#ccff00] text-black font-black uppercase tracking-wider hover:bg-white transition-colors text-sm"
          >
            Connect Repository <ArrowRight className="w-5 h-5" />
          </a>
        </section>
      </main>
      <Footer />
    </div>
  );
}

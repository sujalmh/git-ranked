import { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import Image from 'next/image';
import { sql } from '@/lib/db';
import Link from 'next/link';
import { Star, ArrowRight, Award, PlusCircle } from 'lucide-react';
import { getPublicRepository } from '@/lib/github-api';

export const metadata: Metadata = {
  title: 'Public Open-Source Repositories Showcase | GitRanked',
  description: 'Explore active open-source GitHub repositories analyzed on GitRanked with real aggregated health metrics, contributor impact scores, and PR cycle times.',
};

export const revalidate = 60; // Revalidate every minute so newly added public repos show up promptly

type ShowcaseRepo = {
  id: string;
  owner: string;
  name: string;
  avatarUrl: string;
  description: string;
  stars: string;
  lang: string;
  score: number;
};

function extractHealthScore(payload: unknown): number | null {
  if (!payload) return null;
  let obj: Record<string, unknown> | null = null;
  if (typeof payload === 'string') {
    try {
      obj = JSON.parse(payload);
    } catch {
      return null;
    }
  } else if (typeof payload === 'object') {
    obj = payload as Record<string, unknown>;
  }
  if (obj && typeof obj.overallScore === 'number') {
    return Math.round(obj.overallScore);
  }
  return null;
}

export default async function ShowcasePage() {
  const showcaseList: ShowcaseRepo[] = [];
  const seenRepos = new Set<string>();

  try {
    // INNER JOIN insight_caches to strictly fetch ONLY analyzed repositories
    const dbRepos = await sql`
      SELECT DISTINCT ON (r.id) r.id, r.owner, r.name, r.added_at,
             ic.payload as health_payload
      FROM repositories r
      INNER JOIN insight_caches ic ON ic.repo_id = r.id AND ic.contributor_id IS NULL AND ic.insight_type = 'health_metrics'
      WHERE r.is_active = true
      ORDER BY r.id, r.added_at DESC
      LIMIT 36
    `;

    // Fetch GitHub metadata concurrently for fast page load
    const showcaseResults = await Promise.all(
      dbRepos.map(async (repo) => {
        // Fetch live GitHub metadata — returns null for private or deleted repos
        const githubInfo = await getPublicRepository(repo.owner, repo.name);

        // STRICT PRIVACY & PUBLIC FILTER: Skip private or inaccessible repos completely
        if (!githubInfo) return null;

        const healthScore = extractHealthScore(repo.health_payload);

        // DO NOT SHOW UNANALYZED REPOSITORIES
        if (healthScore === null) return null;

        return {
          id: String(repo.id),
          owner: repo.owner as string,
          name: repo.name as string,
          avatarUrl: githubInfo.owner?.avatar_url || `https://github.com/${repo.owner}.png`,
          description: githubInfo.description || 'Public open-source repository analyzed on GitRanked.',
          stars: githubInfo.stargazers_count !== undefined
            ? githubInfo.stargazers_count >= 1000
              ? `${(githubInfo.stargazers_count / 1000).toFixed(1)}k`
              : `${githubInfo.stargazers_count}`
            : '0',
          lang: githubInfo.language || 'Code',
          score: healthScore,
        };
      })
    );

    for (const item of showcaseResults) {
      if (item !== null) {
        const repoKey = `${item.owner}/${item.name}`.toLowerCase();
        if (!seenRepos.has(repoKey)) {
          seenRepos.add(repoKey);
          showcaseList.push(item);
        }
      }
    }
  } catch (err) {
    console.error('Error fetching database repos for showcase:', err);
  }

  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <Navbar />
      <main className="flex-1 w-full px-4 sm:px-6 md:px-12 py-8 sm:py-12 space-y-8">
        {/* Header */}
        <div className="text-left max-w-4xl mb-8">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter leading-[0.95] mb-4">
            PUBLIC REPOSITORIES <span className="text-accent">SHOWCASE</span>.
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-zinc-400 font-medium leading-relaxed">
            Real-time engineering metrics, code review velocity, and contributor impact scores across public analyzed repositories.
          </p>
        </div>

        {/* Repository Showcase Grid */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight flex items-center gap-2 text-white">
              <Award className="w-6 h-6 text-accent" /> Analyzed Repositories ({showcaseList.length})
            </h2>
          </div>

          {showcaseList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
              {showcaseList.map((repo, idx) => (
                <Link
                  key={`${repo.owner}-${repo.name}-${repo.id}-${idx}`}
                  href={`/github/${repo.owner}/${repo.name}`}
                  className="sleek-panel p-6 flex flex-col gap-4 group cursor-pointer border-2 border-white/10 hover:bg-accent hover:border-accent hover:text-black transition-all duration-200"
                >
                  {/* Top Row: Avatar Logo, Title, Stars, Language, and Health Score Badge */}
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white/5 border border-white/20 group-hover:bg-black group-hover:border-black transition-colors shrink-0 flex items-center justify-center overflow-hidden rounded-lg">
                      <Image
                        src={repo.avatarUrl}
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
                      <div className="flex items-center gap-2 mt-0.5 text-xs font-bold text-zinc-400 group-hover:text-black/80 transition-colors">
                        <span className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 group-hover:fill-black group-hover:text-black transition-colors" />
                          {repo.stars}
                        </span>
                        {repo.lang && (
                          <span className="uppercase tracking-wider">
                            • {repo.lang}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-3xl font-black text-accent group-hover:text-black leading-none transition-colors">
                        {repo.score}
                      </div>
                      <div className="text-[10px] font-bold uppercase text-zinc-400 group-hover:text-black/80 tracking-wider mt-1 transition-colors">
                        HEALTH
                      </div>
                    </div>
                  </div>

                  {/* Repo Description */}
                  <p className="text-xs text-zinc-400 group-hover:text-black/80 line-clamp-2 leading-relaxed font-medium transition-colors my-1">
                    {repo.description}
                  </p>

                  {/* Card Footer: View Insights Button */}
                  <div className="mt-auto pt-4 border-t-2 border-white/10 group-hover:border-black/20 flex items-center justify-between transition-colors">
                    <span className="text-xs font-bold text-zinc-400 group-hover:text-black/80 uppercase tracking-wider transition-colors">
                      PUBLIC ANALYTICS
                    </span>
                    <div className="flex items-center gap-2 text-accent group-hover:text-black text-sm font-bold uppercase tracking-wider group-hover:translate-x-1 transition-all">
                      <span>VIEW INSIGHTS</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="sleek-panel p-12 text-center max-w-xl mx-auto my-8 border-2 border-white/20">
              <PlusCircle className="w-12 h-12 text-accent mx-auto mb-4" />
              <h3 className="text-2xl font-black uppercase tracking-tight text-white mb-2">No Analyzed Repositories Found</h3>
              <p className="text-zinc-400 text-sm mb-6">
                Be the first to analyze a public open-source GitHub repository on GitRanked.
              </p>
              <a
                href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-accent text-black font-black uppercase tracking-wider hover:bg-white transition-colors text-xs font-bold"
              >
                Track a Public Repository
              </a>
            </div>
          )}
        </section>

        {/* CTA Banner */}
        <section className="sleek-panel p-10 sm:p-16 text-center border-accent/30 bg-gradient-to-b from-transparent to-accent/5 max-w-5xl mx-auto my-12 border-2">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black uppercase tracking-tighter mb-4">Want your repository listed here?</h2>
          <p className="text-base sm:text-lg text-zinc-400 mb-8 max-w-xl mx-auto font-medium leading-relaxed">
            Connect your public GitHub repository to analyze PR review times, engineering velocity, and contributor impact scores.
          </p>
          <a
            href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-accent text-black font-black uppercase tracking-wider hover:bg-white transition-colors text-sm font-bold"
          >
            Connect Repository <ArrowRight className="w-5 h-5" />
          </a>
        </section>
      </main>
      <Footer />
    </div>
  );
}

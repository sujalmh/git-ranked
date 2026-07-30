import { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { sql } from '@/lib/db';
import Link from 'next/link';
import { Star, ArrowRight, Award, Cpu, Code2, AlertCircle } from 'lucide-react';
import { getPublicRepository } from '@/lib/github-api';
import { fetchRepoEvents, getRepoAnalysisData } from '@/lib/analysis';

export const metadata: Metadata = {
  title: 'Public Open-Source Repositories Showcase | GitRanked',
  description: 'Explore active open-source GitHub repositories analyzed on GitRanked with real aggregated health metrics, contributor impact scores, and PR cycle times.',
};

export const revalidate = 1800; // Revalidate every 30 minutes

type ShowcaseRepo = {
  id?: string;
  owner: string;
  name: string;
  description: string;
  stars: string;
  lang: string;
  category: string;
  score: number | null; // Real score if analyzed, null if pending real analysis
  isAnalyzed: boolean;
};

// Curated list of popular open-source projects to showcase real public GitHub repos
const SEED_REPOSITORIES = [
  { owner: 'facebook', name: 'react', description: 'The library for web and native user interfaces.', stars: '230k', lang: 'JavaScript', category: 'Frontend Core' },
  { owner: 'vercel', name: 'next.js', description: 'The React Framework for the Web.', stars: '125k', lang: 'TypeScript', category: 'Web Framework' },
  { owner: 'tailwindlabs', name: 'tailwindcss', description: 'A utility-first CSS framework for rapid UI development.', stars: '82k', lang: 'TypeScript', category: 'CSS & Styling' },
  { owner: 'torvalds', name: 'linux', description: 'Linux kernel source tree.', stars: '175k', lang: 'C', category: 'Systems & OS' },
  { owner: 'golang', name: 'go', description: 'The Go programming language engine and tooling.', stars: '122k', lang: 'Go', category: 'Languages' },
  { owner: 'shadcn-ui', name: 'ui', description: 'Beautifully designed components that you can copy and paste into your apps.', stars: '75k', lang: 'TypeScript', category: 'UI Components' },
];

export default async function ShowcasePage() {
  const showcaseList: ShowcaseRepo[] = [];

  try {
    // 1. Fetch tracked public database repositories
    const dbRepos = await sql`
      SELECT id, owner, name
      FROM repositories
      WHERE is_active = true AND (installation_id IS NULL OR share_enabled = true)
      ORDER BY added_at DESC
      LIMIT 24
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

      // Fetch GitHub details
      const githubInfo = await getPublicRepository(repo.owner, repo.name);

      showcaseList.push({
        id: repo.id,
        owner: repo.owner,
        name: repo.name,
        description: githubInfo?.description || 'Public GitHub repository tracked on GitRanked.',
        stars: githubInfo?.stargazers_count ? `${Math.round(githubInfo.stargazers_count / 1000)}k` : '—',
        lang: githubInfo?.language || 'Code',
        category: 'Tracked Repository',
        score: realScore,
        isAnalyzed,
      });
    }
  } catch (err) {
    console.error('Error fetching database repos for showcase:', err);
  }

  // 2. Add seed featured open-source repositories if not already included
  for (const seed of SEED_REPOSITORIES) {
    const alreadyIncluded = showcaseList.some(
      (item) => item.owner.toLowerCase() === seed.owner.toLowerCase() && item.name.toLowerCase() === seed.name.toLowerCase()
    );

    if (!alreadyIncluded) {
      let realScore: number | null = null;
      let isAnalyzed = false;

      try {
        const existingInDb = await sql`
          SELECT id FROM repositories WHERE owner = ${seed.owner} AND name = ${seed.name} LIMIT 1
        `;
        if (existingInDb.length > 0) {
          const events = await fetchRepoEvents(existingInDb[0].id);
          if (events.length > 0) {
            const analysis = await getRepoAnalysisData(existingInDb[0].id);
            if (analysis && analysis.isAnalysed && analysis.healthMetrics?.overallScore !== undefined) {
              realScore = Math.round(analysis.healthMetrics.overallScore);
              isAnalyzed = true;
            }
          }
        }
      } catch (_) {
        // Ignore fallback errors
      }

      showcaseList.push({
        owner: seed.owner,
        name: seed.name,
        description: seed.description,
        stars: seed.stars,
        lang: seed.lang,
        category: seed.category,
        score: realScore, // Strictly null if not tracked/analyzed in DB
        isAnalyzed,
      });
    }
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
            Discover real-time engineering metrics, code review velocity, and contributor impact scores across public open-source projects tracked on GitRanked.
          </p>
        </div>

        {/* Repository Showcase Grid */}
        <section className="mb-16">
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-8 flex items-center gap-2 text-white">
            <Award className="w-7 h-7 text-[#ccff00]" /> Open-Source Showcase
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full">
            {showcaseList.map((repo) => (
              <Link
                key={`${repo.owner}-${repo.name}`}
                href={`/github/${repo.owner}/${repo.name}`}
                className="sleek-panel p-6 hover:border-[#ccff00]/50 transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded">
                      {repo.category}
                    </span>
                    <div className="flex items-center gap-1 text-xs font-bold text-amber-400">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      {repo.stars}
                    </div>
                  </div>

                  <h3 className="text-xl font-black uppercase tracking-tight text-white group-hover:text-[#ccff00] transition-colors mb-2 truncate">
                    {repo.owner} / {repo.name}
                  </h3>

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

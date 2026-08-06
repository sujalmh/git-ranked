import { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Zap, BarChart3, Code2, Users, Cpu } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About Us | GitRanked',
  description: 'Learn about GitRanked, our mission, AI-driven engineering metrics framework, and how we help engineering leaders optimize code review performance.',
};

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <Navbar />
      <main className="flex-1 w-full px-6 md:px-12 lg:px-16 py-12">
        <div className="text-left max-w-4xl mb-12">
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tighter leading-[0.95] mb-4">
            ABOUT <span className="text-accent">GITRANKED</span>.
          </h1>
          <p className="text-base sm:text-lg text-zinc-400 font-medium leading-relaxed">
            Empowering modern engineering organizations with objective, AI-assisted repository metrics and contributor impact analysis.
          </p>
        </div>

        <div className="sleek-panel p-8 sm:p-12 space-y-10 text-zinc-300 leading-relaxed font-medium max-w-5xl">
          <section className="space-y-4">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Zap className="w-6 h-6 text-accent" /> Why We Built GitRanked
            </h2>
            <p>
              Traditional developer metrics focus on naive counts: lines of code added, raw commit counts, or story points completed. These vanity metrics fail to capture real engineering value, incentivize shallow contributions, and completely ignore critical &quot;glue work&quot; such as thorough code reviews, mentoring, and technical debt maintenance.
            </p>
            <p>
              GitRanked was created to solve this challenge. By ingesting deep GitHub webhook data—including pull request review depth, turnaround latency, issue resolutions, and contributor collaboration graphs—GitRanked calculates balanced scores and actionable insights for engineering leads and CTOs.
            </p>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-8">
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <BarChart3 className="w-8 h-8 text-accent mb-3" />
              <h3 className="text-xl font-bold uppercase tracking-tight text-white mb-2">PR Review Velocity</h3>
              <p className="text-sm text-zinc-400">
                Pinpoint code review bottlenecks before they slow down release cycles or burn out senior developers.
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <Cpu className="w-8 h-8 text-accent mb-3" />
              <h3 className="text-xl font-bold uppercase tracking-tight text-white mb-2">AI-Powered Insights</h3>
              <p className="text-sm text-zinc-400">
                Leverage generative AI models to summarize complex pull request diffs, highlight key architectural changes, and score review quality.
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <Users className="w-8 h-8 text-amber-400 mb-3" />
              <h3 className="text-xl font-bold uppercase tracking-tight text-white mb-2">Fair Recognition</h3>
              <p className="text-sm text-zinc-400">
                Recognize unsung heroes on your team who maintain code stability and conduct high-value pull request reviews.
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <Code2 className="w-8 h-8 text-emerald-400 mb-3" />
              <h3 className="text-xl font-bold uppercase tracking-tight text-white mb-2">Open Source Friendly</h3>
              <p className="text-sm text-zinc-400">
                Public showcase tools that let maintainers evaluate repository health and celebrate top community contributors transparently.
              </p>
            </div>
          </div>

          <section className="space-y-4 pt-4 border-t border-white/10">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white">Explore Public Metrics</h2>
            <p>
              Check out our public repository showcase to see real-time analytics in action on popular open-source software projects.
            </p>
            <div className="pt-2">
              <Link
                href="/showcase"
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-black font-black uppercase tracking-wider hover:bg-white transition-colors text-sm"
              >
                Browse Public Showcase
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

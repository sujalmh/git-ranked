import Link from 'next/link';

export function Footer() {
  return (
    <footer className="w-full border-t border-white/10 bg-black py-16 px-6 relative z-10">
      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-10">
        <div className="space-y-4 sm:col-span-2 md:col-span-1">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="GitRanked Logo" className="w-7 h-7" />
            <span className="text-xl font-black tracking-tighter uppercase text-white">GitRanked</span>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed">
            AI-powered GitHub repository analytics, engineer contribution scores, and PR cycle metrics.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#ccff00] mb-4">Solutions & Metrics</h3>
          <ul className="space-y-2.5 text-sm text-zinc-400">
            <li>
              <Link href="/github-insights" className="hover:text-white transition-colors">
                GitHub Insights & Analytics
              </Link>
            </li>
            <li>
              <Link href="/pr-review-metrics" className="hover:text-white transition-colors">
                PR Review Metrics
              </Link>
            </li>
            <li>
              <Link href="/repository-health" className="hover:text-white transition-colors">
                Repository Health Check
              </Link>
            </li>
            <li>
              <Link href="/engineering-metrics" className="hover:text-white transition-colors">
                Engineering Metrics
              </Link>
            </li>
            <li>
              <Link href="/github-contributor-analytics" className="hover:text-white transition-colors">
                Contributor Analytics
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#ccff00] mb-4">Showcase & Product</h3>
          <ul className="space-y-2.5 text-sm text-zinc-400">
            <li>
              <Link href="/showcase" className="hover:text-white font-medium text-[#ccff00]/90 transition-colors">
                Public Repositories Showcase
              </Link>
            </li>
            <li>
              <Link href="/" className="hover:text-white transition-colors">
                Home
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className="hover:text-white transition-colors">
                Dashboard
              </Link>
            </li>
            <li>
              <a 
                href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
                className="hover:text-white transition-colors"
              >
                Install GitHub App
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#ccff00] mb-4">Legal & Company</h3>
          <ul className="space-y-2.5 text-sm text-zinc-400">
            <li>
              <Link href="/about" className="hover:text-white transition-colors">
                About Us
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-white transition-colors">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-white transition-colors">
                Contact & Support
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#ccff00] mb-4">Resources</h3>
          <ul className="space-y-2.5 text-sm text-zinc-400">
            <li>
              <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                Sitemap (XML)
              </a>
            </li>
            <li>
              <a href="/robots.txt" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                Robots.txt
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto border-t border-white/5 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-zinc-500 font-medium">
        <span>© {new Date().getFullYear()} GitRanked. All rights reserved.</span>
        <span>Built for engineering excellence & modern code quality.</span>
      </div>
    </footer>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X, ExternalLink, Compass } from 'lucide-react';
import { GithubIcon } from '@/components/icons/GithubIcon';

type NavbarClientProps = {
  user: {
    name?: string | null;
    image?: string | null;
  } | null;
  githubAppSlug: string;
  signOutAction: () => Promise<void>;
  signInAction: () => Promise<void>;
};

export function NavbarClient({ user, githubAppSlug, signOutAction, signInAction }: NavbarClientProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const isSignedIn = !!user;
  const isShowcaseActive = pathname === '/showcase';

  return (
    <header className="sticky top-0 z-50 bg-black border-b-2 border-white/10 w-full">
      <div className="flex items-center justify-between px-6 md:px-12 py-4 w-full">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 shrink-0" onClick={() => setMobileMenuOpen(false)}>
            <Image src="/logo.png" alt="GitRanked Logo" width={32} height={32} className="rounded-none" />
            <span className="text-xl sm:text-2xl font-black tracking-tighter uppercase text-white">GitRanked</span>
          </Link>

          {/* GitHub repo link right next to the logo */}
          <a
            href="https://github.com/sujalmh/git-ranked"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1.5 text-sm font-mono font-medium text-zinc-400 hover:text-accent transition-colors border border-white/10 hover:border-accent/40 px-2.5 py-1 rounded-md"
            aria-label="GitRanked repository on GitHub"
            title="View the GitRanked source code on GitHub"
          >
            <GithubIcon className="w-4 h-4" />
            git-ranked
            <ExternalLink className="w-3 h-3" />
          </a>

          {/* Desktop Left Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-bold tracking-wider uppercase">
            <Link
              href="/showcase"
              className={`inline-flex items-center gap-1.5 transition-all duration-300 px-3 py-1.5 rounded-md border ${
                isShowcaseActive
                  ? 'text-accent font-black border-accent/50 bg-accent/10'
                  : 'text-zinc-300 hover:text-accent border-transparent hover:border-accent/30 hover:bg-accent/5'
              }`}
            >
              <Compass className="w-4 h-4" />
              SHOWCASE
            </Link>
          </nav>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-4">
          {isSignedIn ? (
            <div className="flex items-center gap-6">
              <Link href="/dashboard" className="px-5 py-2 accent-panel text-sm">
                DASHBOARD
              </Link>
              <Link href="/settings" className="text-sm font-bold tracking-wider hover:text-accent transition-colors uppercase text-zinc-300">
                SETTINGS
              </Link>
              <div className="h-6 w-px bg-white/20" />
              <div className="flex items-center gap-3">
                {user.image ? (
                  <Image
                    src={user.image}
                    alt="Avatar"
                    className="w-8 h-8 rounded-full border border-white/20"
                    width={32}
                    height={32}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full border border-white/20 bg-white/10" />
                )}
                {user.name && (
                  <span className="text-sm font-bold tracking-wider uppercase text-zinc-300">
                    {user.name}
                  </span>
                )}
                <form action={signOutAction}>
                  <button type="submit" className="text-sm font-bold tracking-wider hover:text-red-400 transition-colors uppercase ml-2 text-zinc-500 cursor-pointer">
                    Sign Out
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <form action={signInAction}>
                <button type="submit" className="text-sm font-bold tracking-wider hover:text-accent transition-colors uppercase cursor-pointer">
                  Log In
                </button>
              </form>
              <Link
                href={`https://github.com/apps/${githubAppSlug}/installations/new`}
                className="px-5 py-2 accent-panel text-sm flex items-center gap-2"
              >
                <GithubIcon className="w-4 h-4" />
                CONNECT TO GITHUB
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-white hover:text-accent focus:outline-none transition-colors"
            aria-label="Toggle Menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div id="mobile-menu" className="md:hidden border-t border-white/10 bg-black/95 backdrop-blur-md px-4 py-6 space-y-4">
          <Link
            href="/showcase"
            onClick={() => setMobileMenuOpen(false)}
            className={`block w-full py-3 border text-center text-sm font-bold tracking-wider uppercase transition-colors flex items-center justify-center gap-2 ${
              isShowcaseActive
                ? 'bg-accent/10 border-accent/50 text-accent'
                : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:text-accent'
            }`}
          >
            <Compass className="w-4 h-4" />
            SHOWCASE
          </Link>

          <a
            href="https://github.com/sujalmh/git-ranked"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileMenuOpen(false)}
            className="block w-full py-3 bg-zinc-900 border border-zinc-700 text-center text-sm font-bold tracking-wider uppercase text-zinc-200 hover:text-accent flex items-center justify-center gap-2"
          >
            <GithubIcon className="w-4 h-4" />
            GitHub Repository
          </a>

          {isSignedIn ? (
            <div className="flex flex-col space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                {user.image ? (
                  <Image
                    src={user.image}
                    alt="Avatar"
                    className="w-9 h-9 rounded-full border border-white/20"
                    width={36}
                    height={36}
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full border border-white/20 bg-white/10" />
                )}
                {user.name && (
                  <span className="text-base font-bold tracking-wider uppercase text-white">
                    {user.name}
                  </span>
                )}
              </div>

              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-3 accent-panel text-center text-sm font-bold tracking-wider uppercase"
              >
                DASHBOARD
              </Link>

              <Link
                href="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-3 bg-zinc-900 border border-zinc-700 text-center text-sm font-bold tracking-wider hover:text-accent uppercase text-zinc-200"
              >
                SETTINGS
              </Link>

              <form action={signOutAction} className="w-full pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 text-center text-sm font-bold tracking-wider text-red-400 hover:text-red-300 uppercase bg-red-950/20 border border-red-900/40 cursor-pointer"
                >
                  Sign Out
                </button>
              </form>
            </div>
          ) : (
            <div className="flex flex-col space-y-4">
              <form action={signInAction} className="w-full">
                <button
                  type="submit"
                  className="w-full py-3 bg-zinc-900 border border-zinc-700 text-center text-sm font-bold tracking-wider text-white hover:text-accent uppercase cursor-pointer"
                >
                  Log In
                </button>
              </form>

              <Link
                href={`https://github.com/apps/${githubAppSlug}/installations/new`}
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-3 accent-panel text-center text-sm font-bold tracking-wider uppercase flex items-center justify-center gap-2"
              >
                <GithubIcon className="w-4 h-4" />
                CONNECT TO GITHUB
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

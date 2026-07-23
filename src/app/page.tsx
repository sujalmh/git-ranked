import Link from 'next/link';
import Image from 'next/image';
import { GithubIcon } from '@/components/icons/GithubIcon';
import { AnimatedHeroContent } from '@/components/AnimatedHeroContent';
import { AnimatedFeatures } from '@/components/AnimatedFeatures';
import { VisualPipeline } from '@/components/VisualPipeline';
import { AnimatedCards } from '@/components/AnimatedCards';
import { Footer } from '@/components/Footer';
import { auth, signOut } from '@/lib/auth';

export default async function Home() {
  const session = await auth();
  const isSignedIn = !!session;

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-black text-white">
      <header className="w-full z-10 border-b-2 border-white/10 relative">
        <div className="flex items-center justify-between px-6 py-6 w-full">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="GitRanked Logo" width={32} height={32} className="rounded-none" />
            <span className="text-2xl font-black tracking-tighter uppercase">GitRanked</span>
          </div>
          <nav className="flex gap-6 items-center">
            {isSignedIn ? (
              <div className="flex items-center gap-6">
                <Link href="/dashboard" className="px-5 py-2 accent-panel text-sm">
                  DASHBOARD
                </Link>
                <div className="h-6 w-px bg-white/20" />
                <div className="flex items-center gap-3">
                  {session.user?.image ? (
                    <Image
                      src={session.user.image}
                      alt="Avatar"
                      className="w-8 h-8 rounded-full border border-white/20"
                      width={32}
                      height={32}
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full border border-white/20 bg-white/10" />
                  )}
                  {session.user?.name && (
                    <span className="text-sm font-bold tracking-wider uppercase text-zinc-300">
                      {session.user.name}
                    </span>
                  )}
                  <form action={async () => {
                    "use server"
                    await signOut()
                  }}>
                    <button type="submit" className="text-sm font-bold tracking-wider hover:text-red-400 transition-colors uppercase ml-2 text-zinc-500">
                      Sign Out
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <a href="/api/auth/signin" className="text-sm font-bold tracking-wider hover:text-[#ccff00] transition-colors uppercase">
                  Log In
                </a>
                <a 
                  href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`} 
                  className="px-5 py-2 accent-panel text-sm flex items-center gap-2"
                >
                  <GithubIcon className="w-4 h-4" />
                  CONNECT TO GITHUB
                </a>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full z-10 mt-6 mb-16 relative">
        <AnimatedHeroContent isSignedIn={isSignedIn} />

        <div className="w-full px-6 md:px-12 lg:px-16">
          <AnimatedFeatures />

          {/* How it Works Section */}
          <div className="mt-32">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-black mb-4 uppercase tracking-tighter">How it works</h2>
              <p className="text-xl font-medium text-zinc-400 max-w-2xl mx-auto">Get deep insights into your engineering team&apos;s performance in three simple steps.</p>
            </div>
            
            <VisualPipeline />
          </div>

          {/* Who is it for Section */}
          <div className="mt-32 mb-10">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-black mb-4 uppercase tracking-tighter">Who is it for?</h2>
              <p className="text-xl font-medium text-zinc-400 max-w-2xl mx-auto">Built for engineering teams who care about quality and impact.</p>
            </div>
            
            <AnimatedCards />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}


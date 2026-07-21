import Link from 'next/link';
import Image from 'next/image';
import { GitBranch } from 'lucide-react';
import { auth, signIn, signOut } from '@/lib/auth';

export async function Navbar() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-50 bg-black border-b-2 border-white/10 w-full">
      <div className="flex items-center justify-between px-6 py-4 w-full">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.png" alt="GitRanked Logo" width={32} height={32} className="rounded-none" />
          <span className="text-2xl font-black tracking-tighter uppercase text-white">GitRanked</span>
        </Link>
        <div className="flex items-center gap-4">
          {session ? (
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
              <form action={async () => {
                "use server"
                await signIn("github")
              }}>
                <button type="submit" className="text-sm font-bold tracking-wider hover:text-[#ccff00] transition-colors uppercase">
                  Log In
                </button>
              </form>
              <Link
                href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`}
                className="px-5 py-2 accent-panel text-sm"
              >
                CONNECT TO GITHUB
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

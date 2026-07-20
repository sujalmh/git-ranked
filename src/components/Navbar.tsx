import Link from 'next/link';
import Image from 'next/image';
import { GitBranch } from 'lucide-react';
import { auth, signIn, signOut } from '@/lib/auth';

export async function Navbar() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-50 glass border-b-0 rounded-none w-full">
      <div className="flex items-center justify-between p-4 max-w-7xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.png" alt="GitRanked Logo" width={28} height={28} className="rounded-full shadow-md" />
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-500 to-amber-500 bg-clip-text text-transparent">GitRanked</span>
        </Link>
        <div className="flex items-center gap-4">
          {session ? (
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors">
                Dashboard
              </Link>
              <div className="h-6 w-px bg-white/10" />
              <div className="flex items-center gap-2">
                {session.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt="Avatar"
                    className="w-8 h-8 rounded-full border border-white/10"
                    width={32}
                    height={32}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full border border-white/10 bg-white/10" />
                )}
                {session.user?.name && (
                  <span className="text-sm font-medium text-zinc-300 mx-2">
                    {session.user.name}
                  </span>
                )}
                <form action={async () => {
                  "use server"
                  await signOut()
                }}>
                  <button type="submit" className="text-sm text-zinc-400 hover:text-white transition-colors">
                    Sign Out
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <form action={async () => {
              "use server"
              await signIn("github")
            }}>
              <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors text-sm">
                Sign In
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}

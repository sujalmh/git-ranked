import Link from 'next/link';
import { GitBranch } from 'lucide-react';
import { auth, signIn, signOut } from '@/lib/auth';

export async function Navbar() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-50 glass border-b-0 rounded-none w-full">
      <div className="flex items-center justify-between p-4 max-w-7xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2">
          <GitBranch className="w-6 h-6 text-indigo-400" />
          <span className="text-xl font-bold tracking-tight">GitRanked</span>
        </Link>
        <div className="flex items-center gap-4">
          {session ? (
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors">
                Dashboard
              </Link>
              <div className="h-6 w-px bg-white/10" />
              <div className="flex items-center gap-2">
                <img 
                  src={session.user?.image || ''} 
                  alt="Avatar" 
                  className="w-8 h-8 rounded-full border border-white/10"
                />
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

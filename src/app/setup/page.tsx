import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { CheckCircle, GitBranch } from 'lucide-react';
import { auth, signIn } from '@/lib/auth';

export default async function SetupPage() {
  const session = await auth();

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 max-w-2xl mx-auto mt-20 mb-32">
        {session ? (
          // Authenticated: installation is already linked by signIn callback or webhook
          <>
            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-8 border border-green-500/20">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight mb-4">
              Installation Complete!
            </h1>

            <p className="text-xl text-zinc-400 mb-12 leading-relaxed">
              GitRanked is now installed on your repositories. We will start tracking commits, PRs, and reviews immediately.
            </p>

            <Link
              href="/dashboard"
              className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-lg transition-all shadow-lg shadow-indigo-500/20"
            >
              Go to Dashboard
            </Link>
          </>
        ) : (
          // Not authenticated: show sign-in to complete the link
          <>
            <div className="w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center mb-8 border border-indigo-500/20">
              <GitBranch className="w-10 h-10 text-indigo-400" />
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight mb-4">
              One more step
            </h1>

            <p className="text-xl text-zinc-400 mb-12 leading-relaxed">
              Sign in with GitHub to link your installation and start tracking your repositories.
            </p>

            <form
              action={async () => {
                'use server';
                await signIn('github', { redirectTo: '/setup' });
              }}
            >
              <button
                type="submit"
                className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-lg transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-3"
              >
                <GitBranch className="w-5 h-5" />
                Continue with GitHub
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

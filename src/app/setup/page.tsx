import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { AlertCircle, CheckCircle, GitBranch } from 'lucide-react';
import { auth } from '@/lib/auth';

type SetupPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const session = await auth();
  const { error } = await searchParams;
  const installUrl = `https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`;

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
          <>
            <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-8 border border-amber-500/20">
              {error ? (
                <AlertCircle className="w-10 h-10 text-amber-400" />
              ) : (
                <GitBranch className="w-10 h-10 text-amber-400" />
              )}
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight mb-4">
              {error ? 'Setup could not be completed' : 'Complete setup from GitHub'}
            </h1>

            <p className="text-xl text-zinc-400 mb-12 leading-relaxed">
              {error
                ? 'GitHub did not complete the installation authorization. Start the GitRanked install flow again so GitHub can install the app and authorize your account in one pass.'
                : 'After installing GitRanked, GitHub should authorize your account and return you here automatically. If you landed here directly, start from the GitHub App install flow.'}
            </p>

            <a
              href={installUrl}
              className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-lg transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-3"
            >
              <GitBranch className="w-5 h-5" />
              Install GitRanked
            </a>
          </>
        )}
      </main>
    </div>
  );
}

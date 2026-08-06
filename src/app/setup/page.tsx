import { Navbar } from '@/components/Navbar';
import { SetupSuccess } from '@/components/SetupSuccess';
import { AlertCircle, GitBranch } from 'lucide-react';
import { auth } from '@/lib/auth';

type SetupPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
};

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const session = await auth();
  const { error, notice } = await searchParams;
  const installUrl = `https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev'}/installations/new`;
  const isUpdateNotice = notice === 'github_app_update';

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 max-w-xl mx-auto mt-10 mb-20">
        {session ? (
          // Authenticated: installation is already linked by signIn callback or webhook
          <SetupSuccess />
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-5 border border-amber-500/20">
              {error || isUpdateNotice ? (
                <AlertCircle className="w-8 h-8 text-amber-400" />
              ) : (
                <GitBranch className="w-8 h-8 text-amber-400" />
              )}
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight mb-3">
              {error
                ? 'Setup could not be completed'
                : isUpdateNotice
                  ? 'Installation settings updated'
                  : 'Complete setup from GitHub'}
            </h1>

            <p className="text-base text-zinc-400 mb-8 leading-relaxed max-w-lg">
              {error
                ? 'GitHub did not complete the installation authorization. Start the GitRanked install flow again so GitHub can install the app and authorize your account in one pass.'
                : isUpdateNotice
                  ? 'GitHub returned after updating an existing installation. If this browser is not already authenticated, GitHub will not send a new OAuth code for that update path. Start a fresh install authorization flow to connect this account.'
                  : 'After installing GitRanked, GitHub should authorize your account and return you here automatically. If you landed here directly, start from the GitHub App install flow.'}
            </p>

            <a
              href={installUrl}
              className="px-6 py-3 rounded-xl bg-accent text-black hover:bg-white hover:text-black font-semibold text-sm transition-all flex items-center gap-2"
            >
              <GitBranch className="w-4 h-4" />
              Install GitRanked
            </a>
          </>
        )}
      </main>
    </div>
  );
}

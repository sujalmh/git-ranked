import { auth, signIn } from '@/lib/auth';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { UserAiSettings } from '@/components/UserAiSettings';
import { Sparkles, ArrowRight } from 'lucide-react';

export default async function SettingsPage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />

      <main className="flex-1 w-full px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <div className="border-b border-zinc-800 pb-6">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase flex items-center gap-3">
            <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-[#ccff00]" />
            SETTINGS & PREFERENCES
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1">
            Manage your personal AI model configuration, OpenRouter credentials, and platform preferences.
          </p>
        </div>

        {session ? (
          <UserAiSettings />
        ) : (
          <div className="brutal-card p-12 text-center space-y-6 bg-zinc-950">
            <h2 className="text-xl font-bold uppercase text-white">Authentication Required</h2>
            <p className="text-zinc-400 text-sm max-w-md mx-auto">
              Please sign in with your GitHub account to manage your personal OpenRouter API key and model preferences.
            </p>
            <form
              action={async () => {
                'use server';
                await signIn('github');
              }}
            >
              <button
                type="submit"
                className="px-6 py-3 bg-[#ccff00] text-black font-bold uppercase text-sm tracking-wider hover:bg-[#b8e600] inline-flex items-center gap-2"
              >
                LOG IN WITH GITHUB <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

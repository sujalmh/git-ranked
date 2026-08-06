'use client';

import { useEffect } from 'react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Root error boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="text-center space-y-4 max-w-md px-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Something went wrong</h1>
        <p className="text-sm text-zinc-400">
          An unexpected error occurred while loading this page.
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-5 py-2.5 bg-accent text-black font-bold uppercase tracking-wider text-sm hover:bg-white transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

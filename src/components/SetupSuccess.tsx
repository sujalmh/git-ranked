'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, ArrowRight } from 'lucide-react';

export function SetupSuccess() {
  const [countdown, setCountdown] = useState(5);
  const router = useRouter();

  useEffect(() => {
    if (countdown <= 0) {
      router.push('/dashboard');
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, router]);

  return (
    <>
      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-5 border border-green-500/20">
        <CheckCircle className="w-8 h-8 text-green-400" />
      </div>

      <h1 className="text-3xl font-extrabold tracking-tight mb-3">
        Installation Complete!
      </h1>

      <p className="text-base text-zinc-400 mb-4 leading-relaxed max-w-md">
        GitRanked is now installed on your repositories. We will start tracking commits, PRs, and reviews immediately.
      </p>

      <div className="mb-8">
        <span className="text-xs font-bold uppercase tracking-wider text-accent bg-accent/10 border border-accent/30 px-4 py-2 rounded-full inline-flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
          </span>
          Redirecting to dashboard in {countdown}s...
        </span>
      </div>

      <div>
        <Link
          href="/dashboard"
          className="px-6 py-3 rounded-xl bg-accent text-black hover:bg-white hover:text-black font-semibold text-sm transition-all inline-flex items-center gap-2"
        >
          Go to Dashboard Now <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </>
  );
}

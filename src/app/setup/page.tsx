import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';

export default function SetupPage() {
  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 max-w-2xl mx-auto mt-20 mb-32">
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
      </main>
    </div>
  );
}

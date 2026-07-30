import { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { FileCheck, Shield, AlertCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service | GitRanked',
  description: 'GitRanked terms of service, user agreements, GitHub integration rules, and acceptable use policies.',
};

export default function TermsPage() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <Navbar />
      <main className="flex-1 w-full px-6 md:px-12 lg:px-16 py-12">
        <div className="text-left max-w-4xl mb-12">
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tighter leading-[0.95] mb-4">
            TERMS OF <span className="text-[#ccff00]">SERVICE</span>.
          </h1>
          <p className="text-base sm:text-lg text-zinc-400 font-medium">Last Updated: July 30, 2026</p>
        </div>

        <div className="sleek-panel p-8 sm:p-12 space-y-10 text-zinc-300 leading-relaxed text-base font-medium max-w-5xl">
          <section className="space-y-4">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <FileCheck className="w-6 h-6 text-[#ccff00]" /> 1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using GitRanked (gitranked.dev), you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you must discontinue your use of our platform immediately.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-[#ccff00]" /> 2. GitHub Integration & Access
            </h2>
            <p>
              GitRanked requires authorization to access your GitHub account or organizations to fetch pull requests, commits, and review metadata. You warrant that you have full authorization to connect the repositories you select. You may revoke GitRanked&apos;s access at any time via your GitHub Applications settings.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white">3. Acceptable Use</h2>
            <p>You agree not to engage in any prohibited activity including:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Attempting to bypass authentication or gain unauthorized access to private repository data of other users.</li>
              <li>Using automated scraping, bots, or rate-limit overloading tools against GitRanked endpoints.</li>
              <li>Using GitRanked for any illegal activities or in violation of GitHub Developer Terms.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-[#ccff00]" /> 4. Disclaimer of Warranties
            </h2>
            <p>
              GitRanked is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. We disclaim all warranties of any kind, whether express or implied, including metrics accuracy, uptime guarantees, or fitness for a particular software engineering evaluation purpose.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white">5. Contact Information</h2>
            <p>
              Questions about these Terms should be submitted through our <a href="/contact" className="text-[#ccff00] font-semibold underline">Contact Page</a>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

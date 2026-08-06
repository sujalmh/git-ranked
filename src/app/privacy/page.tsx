import { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Eye, FileText, Cookie, Lock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy | GitRanked',
  description: 'GitRanked privacy policy, data collection policies, DART cookie disclosures, and Google AdSense compliance details.',
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <Navbar />
      <main className="flex-1 w-full px-6 md:px-12 lg:px-16 py-12">
        <div className="text-left max-w-4xl mb-12">
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tighter leading-[0.95] mb-4">
            PRIVACY <span className="text-accent">POLICY</span>.
          </h1>
          <p className="text-base sm:text-lg text-zinc-400 font-medium">Effective Date: July 30, 2026</p>
        </div>

        <div className="sleek-panel p-8 sm:p-12 space-y-10 text-zinc-300 leading-relaxed text-base font-medium max-w-5xl">
          <section className="space-y-4">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Eye className="w-6 h-6 text-accent" /> 1. Overview
            </h2>
            <p>
              GitRanked (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the GitRanked platform located at gitranked.dev. We respect your privacy and are committed to protecting personal data collected through our service. This Privacy Policy explains what information we collect, how we use it, and how third-party partners like Google AdSense process cookie data.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <FileText className="w-6 h-6 text-accent" /> 2. Information We Collect
            </h2>
            <p>We collect information to provide high-quality engineering metrics and code analytics:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>GitHub Account & Auth Data:</strong> When you log in via GitHub OAuth, we receive your public username, email, profile photo, and authorized OAuth token to retrieve public/private repository metadata.</li>
              <li><strong>Repository Activity Data:</strong> Event data (PRs, commits, reviews, workflow events) required to calculate contributor scores, PR velocity, and repository health.</li>
              <li><strong>Log & Analytics Data:</strong> IP addresses, browser types, device info, and page activity logged automatically to maintain service security and performance.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Cookie className="w-6 h-6 text-accent" /> 3. Google AdSense & Cookies Policy
            </h2>
            <p>
              We use third-party advertising vendors, including Google, to serve ads when you visit our website.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>DART Cookies:</strong> Google&apos;s use of advertising cookies enables it and its partners to serve ads to users based on their visit to GitRanked and/or other sites on the Internet.</li>
              <li><strong>Opting Out:</strong> Users may opt out of personalized advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-accent underline">Google Ads Settings</a> or <a href="https://www.aboutads.info" target="_blank" rel="noopener noreferrer" className="text-accent underline">aboutads.info</a>.</li>
              <li><strong>Third-Party Vendors:</strong> Other third-party ad networks or servers may also use cookies, JavaScript, or Web Beacons to measure campaign effectiveness and personalize ad content. GitRanked has no access to or control over these cookies used by third-party advertisers.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Lock className="w-6 h-6 text-accent" /> 4. Data Security & Retention
            </h2>
            <p>
              We implement industry-standard security measures to guard your repository metadata and user profile information against unauthorized access, disclosure, or alteration. We do not store raw source code files; we strictly process GitHub event streams and commit statistics.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white">5. Contact Us</h2>
            <p>
              If you have any questions regarding this Privacy Policy or data requests, please visit our <a href="/contact" className="text-accent underline">Contact Page</a>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

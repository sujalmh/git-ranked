import { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { MessageSquare, Send } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact Support & Feedback | GitRanked',
  description: 'Get in touch with the GitRanked team for platform support, enterprise inquiries, feedback, or privacy requests.',
};

export default function ContactPage() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <Navbar />
      <main className="flex-1 w-full px-6 md:px-12 lg:px-16 py-12">
        <div className="text-left max-w-4xl mb-12">
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tighter leading-[0.95] mb-4">
            CONTACT <span className="text-[#ccff00]">US</span>.
          </h1>
          <p className="text-base sm:text-lg text-zinc-400 font-medium">
            Have questions about GitRanked, need assistance with your GitHub integration, or want to share feedback? Send us a message below.
          </p>
        </div>

        <div className="max-w-4xl">
          <div className="sleek-panel p-8 sm:p-12">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white mb-6">Send Us a Message</h2>
            <form action="#" className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="name" className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-2">
                    Your Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    placeholder="Jane Doe"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#ccff00]"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    placeholder="jane@company.com"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="subject" className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-2">
                  Subject
                </label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  required
                  placeholder="Repository analytics question..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={6}
                  required
                  placeholder="How can we help your engineering team?"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#ccff00] resize-none"
                ></textarea>
              </div>

              <button
                type="button"
                className="w-full py-4 bg-[#ccff00] text-black font-black uppercase tracking-wider hover:bg-white transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <Send className="w-4 h-4" /> Send Message
              </button>
            </form>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

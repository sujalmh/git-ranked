import { AnimatedHeroContent } from '@/components/AnimatedHeroContent';
import { AnimatedFeatures } from '@/components/AnimatedFeatures';
import { VisualPipeline } from '@/components/VisualPipeline';
import { AnimatedCards } from '@/components/AnimatedCards';
import { Footer } from '@/components/Footer';
import { auth } from '@/lib/auth';

import { Navbar } from '@/components/Navbar';

export default async function Home() {
  const session = await auth();
  const isSignedIn = !!session;

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-black text-white">
      <Navbar />

      <main className="flex-1 w-full z-10 mt-6 mb-16 relative">
        <AnimatedHeroContent isSignedIn={isSignedIn} />

        <div className="w-full px-4 sm:px-6 md:px-12 lg:px-16">
          <AnimatedFeatures />

          {/* How it Works Section */}
          <div className="mt-20 sm:mt-32">
            <div className="text-center mb-10 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-3 sm:mb-4 uppercase tracking-tighter">How it works</h2>
              <p className="text-sm sm:text-lg md:text-xl font-medium text-zinc-400 max-w-2xl mx-auto">Get deep insights into your engineering team&apos;s performance in three simple steps.</p>
            </div>
            
            <VisualPipeline />
          </div>

          {/* Who is it for Section */}
          <div className="mt-20 sm:mt-32 mb-10">
            <div className="text-center mb-10 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-3 sm:mb-4 uppercase tracking-tighter">Who is it for?</h2>
              <p className="text-sm sm:text-lg md:text-xl font-medium text-zinc-400 max-w-2xl mx-auto">Built for engineering teams who care about quality and impact.</p>
            </div>
            
            <AnimatedCards />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}


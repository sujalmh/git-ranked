import { SEOLandingPage } from '@/components/SEOLandingPage';
import { seoPages } from '@/lib/seo-content';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export function generateMetadata(): Metadata {
  const data = seoPages['github-insights'];
  if (!data) return {};
  
  return {
    title: data.title,
    description: data.metaDescription,
    openGraph: {
      title: data.title,
      description: data.metaDescription,
      type: 'website',
    },
  };
}

export default function Page() {
  const data = seoPages['github-insights'];
  
  if (!data) {
    notFound();
  }

  return <SEOLandingPage data={data} />;
}

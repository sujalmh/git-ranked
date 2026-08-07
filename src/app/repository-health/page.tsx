import { SEOLandingPage } from '@/components/SEOLandingPage';
import { SeoFaqScript } from '@/components/SeoFaqScript';
import { seoPages } from '@/lib/seo-content';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export function generateMetadata(): Metadata {
  const data = seoPages['repository-health'];
  if (!data) return {};
  
  return {
    title: data.title,
    description: data.metaDescription,
    alternates: {
      canonical: '/'+data.slug,
    },
    openGraph: {
      title: data.title,
      description: data.metaDescription,
      type: 'website',
      url: '/'+data.slug,
    },
    twitter: {
      card: 'summary_large_image',
      title: data.title,
      description: data.metaDescription,
    },
  };
}

export default function Page() {
  const data = seoPages['repository-health'];
  
  if (!data) {
    notFound();
  }

  return (
    <>
      <SeoFaqScript data={data} />
      <SEOLandingPage data={data} />
    </>
  );
}

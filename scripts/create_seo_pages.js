/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const slugs = ["github-insights", "pr-review-metrics", "repository-health", "engineering-metrics", "github-contributor-analytics"];

for (const slug of slugs) {
  const dir = path.join(__dirname, '..', 'src', 'app', slug);
  fs.mkdirSync(dir, { recursive: true });
  const content = `import { SEOLandingPage } from '@/components/SEOLandingPage';
import { seoPages } from '@/lib/seo-content';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export function generateMetadata(): Metadata {
  const data = seoPages['${slug}'];
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
  const data = seoPages['${slug}'];
  
  if (!data) {
    notFound();
  }

  return <SEOLandingPage data={data} />;
}
`;
  fs.writeFileSync(path.join(dir, 'page.tsx'), content);
}

import { MetadataRoute } from 'next';
import { seoPages } from '@/lib/seo-content';
import { sql } from '@/lib/db';

export const revalidate = 3600; // Revalidate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gitranked.dev';

  // 1. Core pages, legal compliance pages, and public showcase
  const staticRoutes = [
    '',
    'showcase',
    'about',
    'privacy',
    'terms',
    'contact',
  ];

  const staticPages: MetadataRoute.Sitemap = [
    ...staticRoutes.map((route) => ({
      url: route ? `${baseUrl}/${route}` : baseUrl,
      lastModified: new Date(),
      changeFrequency: (route === '' || route === 'showcase' ? 'daily' : 'monthly') as 'daily' | 'monthly',
      priority: route === '' ? 1.0 : route === 'showcase' ? 0.9 : 0.7,
    })),
    ...Object.keys(seoPages).map((slug) => ({
      url: `${baseUrl}/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];

  // 2. Dynamic public repository pages only (exclude private organization repos)
  let repoPages: MetadataRoute.Sitemap = [];
  try {
    const repos = await sql`
      SELECT owner, name, added_at
      FROM repositories
      WHERE is_active = true AND (installation_id IS NULL OR share_enabled = true)
      ORDER BY added_at DESC
      LIMIT 1000
    `;

    repoPages = repos.map((repo) => ({
      url: `${baseUrl}/github/${repo.owner}/${repo.name}`,
      lastModified: repo.added_at ? new Date(repo.added_at) : new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));
  } catch (error) {
    console.error('Error querying repositories for sitemap:', error);
  }

  return [...staticPages, ...repoPages];
}

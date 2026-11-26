import { MetadataRoute } from 'next';
import { seoPages } from '@/lib/seo-content';
import { sql } from '@/lib/db';

export const revalidate = 3600; // Revalidate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gitranked.dev';

  // 1. Core pages, legal compliance pages, and public showcase. These are
  // static, so no lastModified is emitted — a fabricated "now" timestamp on
  // every build teaches crawlers to distrust the sitemap.
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
      changeFrequency: (route === '' || route === 'showcase' ? 'daily' : 'monthly') as 'daily' | 'monthly',
      priority: route === '' ? 1.0 : route === 'showcase' ? 0.9 : 0.7,
    })),
    ...Object.keys(seoPages).map((slug) => ({
      url: `${baseUrl}/${slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];

  // 2. Public repository pages that actually render an analysis. A repo is
  // indexable only when it has cached health metrics and real activity — the
  // same condition the page's metadata uses (hasRenderablePublicAnalysis).
  // Listing unanalysed, deleted, or private repos here caused soft 404s and
  // 5xx responses in Search Console.
  let repoPages: MetadataRoute.Sitemap = [];
  try {
    const repos = await sql`
      SELECT r.owner, r.name, MAX(ic.generated_at) AS updated_at
      FROM repositories r
      INNER JOIN insight_caches ic
        ON ic.repo_id = r.id
        AND ic.contributor_id IS NULL
        AND ic.insight_type = 'health_metrics'
      WHERE r.is_active = true
        AND (r.installation_id IS NULL OR r.public_enabled = true)
        AND EXISTS (SELECT 1 FROM github_events e WHERE e.repo_id = r.id)
      GROUP BY r.id, r.owner, r.name
      ORDER BY updated_at DESC
      LIMIT 1000
    `;

    repoPages = repos.map((repo) => ({
      url: `${baseUrl}/github/${repo.owner}/${repo.name}`,
      lastModified: repo.updated_at ? new Date(repo.updated_at as string) : undefined,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));
  } catch (error) {
    console.error('Error querying repositories for sitemap:', error);
  }

  return [...staticPages, ...repoPages];
}

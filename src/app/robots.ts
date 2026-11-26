import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gitranked.dev';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private HTML pages are intentionally crawlable and marked noindex in
        // their metadata. Blocking them in robots.txt would hide that signal
        // and leave stale URLs stuck as "Blocked by robots.txt" / soft 404s.
        disallow: ['/api', '/admin'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

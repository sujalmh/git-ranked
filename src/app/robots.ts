import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gitranked.dev';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/dashboard/',
          '/repos/',
          '/shared/',
          '/settings/',
          '/setup/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

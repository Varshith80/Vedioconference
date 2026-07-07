import type { MetadataRoute } from 'next';

/**
 * robots.txt. Marketing pages are indexable; /dashboard, /admin and
 * /api are disallowed. Sitemap is advertised.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: ['/dashboard', '/admin', '/api', '/auth'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

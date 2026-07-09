import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

/**
 * robots.txt. Marketing pages are indexable; /dashboard, /admin
 * and /api are disallowed. Sitemap is advertised.
 */
export default function robots(): MetadataRoute.Robots {
  const base = publicEnv().NEXT_PUBLIC_SITE_URL;
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

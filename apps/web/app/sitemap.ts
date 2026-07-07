import type { MetadataRoute } from 'next';
import { getAllPublishedCourseSlugs } from '@/services/courses';
import { getAllPublishedTutorSlugs } from '@/services/tutors';

/**
 * Public sitemap. Includes the static marketing pages plus every
 * published course and tutor. Fails open (returns just the static
 * pages) on Supabase errors so a transient DB blip doesn't kill SEO.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`,      lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/courses`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/tutors`,  lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
  ];

  try {
    const [courses, tutors] = await Promise.all([
      getAllPublishedCourseSlugs(),
      getAllPublishedTutorSlugs(),
    ]);
    return [
      ...staticPages,
      ...courses.map((slug) => ({
        url: `${base}/courses/${slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
      ...tutors.map((slug) => ({
        url: `${base}/tutors/${slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
    ];
  } catch {
    return staticPages;
  }
}

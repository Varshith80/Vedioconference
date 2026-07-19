import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getTutorBySlug, listCoursesForTutorStandalone } from '@/services/tutors';
import { TutorDetail } from '@/components/marketing/tutor-detail';

// =====================================================================
// Sprint 3.8 — Public /tutors/[slug] page. The `slug` route param
// is the tutor UUID (kept for URL backwards-compat). The page is
// read-only and uses the standalone tutor shape (no headline, no
// bio, no rating).
//
// `listCoursesForTutorStandalone` queries the assigned sessions
// via `sessions.tutor_id` (no `course_tutors` join).
//
// `generateStaticParams` is intentionally NOT exported in Sprint
// 3.8: `getAllPublishedTutorSlugs()` returns [] (no marketing
// persona), and emitting `[]` would skip the build-time
// pre-render. The page is rendered on-demand.
// =====================================================================

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string; locale: string }> },
): Promise<Metadata> {
  const { slug, locale } = await params;
  const tutor = await getTutorBySlug(slug);
  if (!tutor) {
    const t = await getTranslations({ locale, namespace: 'Tutors' });
    return { title: t('notFoundTitle') };
  }
  const t = await getTranslations({ locale, namespace: 'Tutors' });
  return {
    title: tutor.full_name,
    description: t('description'),
    alternates: { canonical: `/${locale}/tutors/${slug}` },
    openGraph: {
      title: tutor.full_name,
      description: t('description'),
      type: 'profile',
    },
  };
}

export default async function TutorDetailPage(
  { params }: { params: Promise<{ slug: string; locale: string }> },
) {
  const { slug, locale } = await params;
  setRequestLocale(locale);
  const tutor = await getTutorBySlug(slug);
  if (!tutor) notFound();
  const courses = await listCoursesForTutorStandalone(tutor.id);
  return <TutorDetail tutor={tutor} courses={courses} />;
}

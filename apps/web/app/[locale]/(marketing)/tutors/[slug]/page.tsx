import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getAllPublishedTutorSlugs, getTutorBySlug, listCoursesForTutor } from '@/services/tutors';
import { TutorDetail } from '@/components/marketing/tutor-detail';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  const slugs = await getAllPublishedTutorSlugs();
  return slugs.map((slug) => ({ slug }));
}

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
    description: tutor.bio || tutor.headline || t('description'),
    alternates: { canonical: `/${locale}/tutors/${slug}` },
    openGraph: { title: tutor.full_name, description: tutor.bio || tutor.headline || undefined, type: 'profile' },
  };
}

export default async function TutorDetailPage(
  { params }: { params: Promise<{ slug: string; locale: string }> },
) {
  const { slug, locale } = await params;
  setRequestLocale(locale);
  const tutor = await getTutorBySlug(slug);
  if (!tutor) notFound();
  const courses = await listCoursesForTutor(tutor.id);
  return <TutorDetail tutor={tutor} courses={courses} />;
}

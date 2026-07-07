import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAllPublishedTutorSlugs, getTutorBySlug, listCoursesForTutor } from '@/services/tutors';
import { TutorDetail } from '@/components/marketing/tutor-detail';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  const slugs = await getAllPublishedTutorSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  try {
    const t = await getTutorBySlug(slug);
    return {
      title: t.full_name,
      description: t.bio || t.headline || `Profil du tuteur ${t.full_name}`,
      alternates: { canonical: `/tutors/${slug}` },
      openGraph: { title: t.full_name, description: t.bio || t.headline || undefined, type: 'profile' },
    };
  } catch {
    return { title: 'Tuteur introuvable' };
  }
}

export default async function TutorDetailPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  let tutor;
  try {
    tutor = await getTutorBySlug(slug);
  } catch {
    notFound();
  }
  const courses = await listCoursesForTutor(tutor.id);
  return <TutorDetail tutor={tutor} courses={courses} />;
}

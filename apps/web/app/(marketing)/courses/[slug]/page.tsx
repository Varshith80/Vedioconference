import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAllPublishedCourseSlugs, getCourseBySlug } from '@/services/courses';
import { listCoursesForTutor, listPublishedTutors } from '@/services/tutors';
import { CourseDetail } from '@/components/marketing/course-detail';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  const slugs = await getAllPublishedCourseSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  try {
    const c = await getCourseBySlug(slug);
    return {
      title: c.title,
      description: c.subtitle ?? c.description ?? `Cours de ${c.subject ?? c.title}`,
      alternates: { canonical: `/courses/${slug}` },
      openGraph: { title: c.title, description: c.subtitle ?? undefined, type: 'article' },
    };
  } catch {
    return { title: 'Cours introuvable' };
  }
}

export default async function CourseDetailPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  let course;
  try {
    course = await getCourseBySlug(slug);
  } catch {
    notFound();
  }
  // Tutors who teach this course. We fetch all published tutors
  // (small set) and filter by course membership on the server.
  const tutors = await (async () => {
    const all = await listPublishedTutors();
    const withCourses = await Promise.all(
      all.map(async (t) => ({ tutor: t, courses: await listCoursesForTutor(t.id) })),
    );
    return withCourses
      .filter(({ courses }) => courses.some((c) => c.id === course!.id))
      .map(({ tutor }) => ({
        id: tutor.id,
        slug: tutor.slug,
        full_name: tutor.full_name,
        avatar_url: tutor.avatar_url,
        rating: tutor.rating,
      }));
  })();

  return <CourseDetail course={course} tutors={tutors} />;
}

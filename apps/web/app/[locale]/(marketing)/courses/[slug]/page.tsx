import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getAllPublishedCourseSlugs } from '@/services/courses';
import { getCourseWithChapters } from '@/services/curriculum/courses';
import { listCoursesForTutor, listPublishedTutors } from '@/services/tutors';
import { CourseDetail } from '@/components/marketing/course-detail';
import { ChapterList } from '@/components/marketing/chapter-list';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  const slugs = await getAllPublishedCourseSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string; locale: string }> },
): Promise<Metadata> {
  const { slug, locale } = await params;
  const c = await getCourseWithChapters(slug);
  if (!c) {
    const t = await getTranslations({ locale, namespace: 'Courses' });
    return { title: t('notFoundTitle') };
  }
  const t = await getTranslations({ locale, namespace: 'Courses' });
  return {
    title: c.title,
    description: c.subtitle ?? c.description ?? t('description'),
    alternates: { canonical: `/${locale}/courses/${slug}` },
    openGraph: { title: c.title, description: c.subtitle ?? undefined, type: 'article' },
  };
}

export default async function CourseDetailPage(
  { params }: { params: Promise<{ slug: string; locale: string }> },
) {
  const { slug, locale } = await params;
  setRequestLocale(locale);
  const course = await getCourseWithChapters(slug);
  if (!course) notFound();
  // Tutors who teach this course. We fetch all published tutors
  // (small set) and filter by course membership on the server.
  const courseId = course.id;
  const tutors = await (async () => {
    const all = await listPublishedTutors();
    const withCourses = await Promise.all(
      all.map(async (t) => ({ tutor: t, courses: await listCoursesForTutor(t.id) })),
    );
    return withCourses
      .filter(({ courses }) => courses.some((c) => c.id === courseId))
      .map(({ tutor }) => ({
        id: tutor.id,
        full_name: tutor.full_name,
        avatar_url: tutor.avatar_url,
        rating: tutor.rating,
      }));
  })();

  return (
    <>
      <CourseDetail course={course} tutors={tutors} />
      {course.chapters.length > 0 ? (
        <Section spacing="default" tone="muted" aria-labelledby="course-chapters-title">
          <Container>
            <Heading id="course-chapters-title" level="h2" className="text-2xl sm:text-3xl">
              {locale === 'fr' ? 'Chapitres et sessions' : 'Chapters and sessions'}
            </Heading>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground sm:text-base">
              {locale === 'fr'
                ? 'Achetez une session à la fois. Chaque session est un créneau individuel d’une heure avec un tuteur.'
                : 'Buy one session at a time. Each session is an individual one-hour slot with a tutor.'}
            </p>
            <div className="mt-6">
              <ChapterList
                chapters={course.chapters}
                courseSlug={course.slug}
                basePath={`/${locale}/courses/${course.slug}/chapters`}
              />
            </div>
          </Container>
        </Section>
      ) : null}
    </>
  );
}

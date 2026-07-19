import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getAllPublishedCourseSlugs } from '@/services/courses';
import { getCourseWithChapters } from '@/services/curriculum/courses';
import { CourseDetail } from '@/components/marketing/course-detail';
import { ChapterList } from '@/components/marketing/chapter-list';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { localizedTitle } from '@/lib/i18n/localized-title';

// =====================================================================
// Sprint 3.8 — Tutors are now standalone operational reference records
// (no profile, no auth, no marketing persona). The public course
// detail page no longer renders a "Tutors who teach this course"
// block — the Admin is the only surface that needs to know which
// tutor is assigned to which session. The `listPublishedTutors` /
// `listCoursesForTutor` marketing lookups are gone with the rest of
// the persona surface.
// =====================================================================

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
  // Metadata uses the localized course title so the
  // <title> + OpenGraph card reflect the active locale.
  const t = await getTranslations({ locale, namespace: 'Courses' });
  const title = localizedTitle(c, locale as 'en' | 'fr');
  return {
    title,
    description: c.subtitle ?? c.description ?? t('description'),
    alternates: { canonical: `/${locale}/courses/${slug}` },
    openGraph: { title, description: c.subtitle ?? undefined, type: 'article' },
  };
}

export default async function CourseDetailPage(
  { params }: { params: Promise<{ slug: string; locale: string }> },
) {
  const { slug, locale } = await params;
  setRequestLocale(locale);
  const tCourses = await getTranslations({ locale, namespace: 'Courses' });
  const course = await getCourseWithChapters(slug);
  if (!course) notFound();
  // Pre-resolve the localized title once on the server and
  // pass it to the presentational component. The runtime
  // app never reads the FR workbook's slug alias — the
  // import is keyed on the EN canonical slug, and the FR
  // title lives in `course.metadata.titles.fr`.
  const courseTitle = localizedTitle(course, locale as 'en' | 'fr');

  return (
    <>
      <CourseDetail course={course} displayTitle={courseTitle} />
      {course.chapters.length > 0 ? (
        <Section spacing="default" tone="muted" aria-labelledby="course-chapters-title">
          <Container>
            <Heading id="course-chapters-title" level="h2" className="text-2xl sm:text-3xl">
              {tCourses('chaptersAndSessionsTitle')}
            </Heading>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground sm:text-base">
              {tCourses('chaptersAndSessionsSubtitle')}
            </p>
            <div className="mt-6">
              <ChapterList
                chapters={course.chapters}
                basePath={`/${locale}/courses/${course.slug}/chapters`}
              />
            </div>
          </Container>
        </Section>
      ) : null}
    </>
  );
}

import type { Metadata } from 'next';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { CourseCard } from '@/components/marketing/course-card';
import { getPublishedCourses } from '@/services/courses';
import { BookOpen } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Courses' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: `/${locale}/courses` },
  };
}

export default async function CoursesListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const courses = await getPublishedCourses();
  const t = await getTranslations('Courses');
  const tNav = await getTranslations('Nav');

  return (
    <>
      <PageHeader
        title={t('h1')}
        description={t('intro')}
        breadcrumbs={[
          { label: tNav('breadcrumbs.home'), href: '/' },
          { label: tNav('breadcrumbs.courses') },
        ]}
      />

      <Section spacing="default">
        <Container>
          {courses.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-6 w-6" aria-hidden="true" />}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
            />
          ) : (
            <ul
              role="list"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
            >
              {courses.map((course) => (
                <li key={course.id} className="relative">
                  <CourseCard course={course} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>
    </>
  );
}

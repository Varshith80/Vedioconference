import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { PageHeader } from '@/components/shared/page-header';
import { CourseCard } from '@/components/marketing/course-card';
import { CtaBand } from '@/components/marketing/cta-band';
import { getProgramBySlug, getGradeBySlug } from '@/services/curriculum/programs';
import { getCoursesByProgram } from '@/services/curriculum/courses';
import { BRAND } from '@/lib/constants/brand';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: { params: Promise<{ levelSlug: string; gradeSlug: string; locale: string }> },
): Promise<Metadata> {
  const { levelSlug, gradeSlug, locale } = await params;
  const program = await getProgramBySlug(levelSlug);
  const grade = program ? await getGradeBySlug(program.id, gradeSlug) : null;
  const title = grade && program
    ? `${grade.title} · ${program.title}`
    : 'Not found';
  return {
    title: `${title} — ${BRAND.name}`,
    alternates: { canonical: `/${locale}/levels/${levelSlug}/grades/${gradeSlug}` },
  };
}

/**
 * `/[locale]/levels/[levelSlug]/grades/[gradeSlug]` — courses
 * in a grade (e.g. `high-school` / `grade-11`). Only the High
 * School program has grades today; the route is left in place
 * for future programs that may need their own sub-level.
 */
export default async function GradePage(
  { params }: { params: Promise<{ levelSlug: string; gradeSlug: string; locale: string }> },
) {
  const { levelSlug, gradeSlug, locale } = await params;
  setRequestLocale(locale);

  const program = await getProgramBySlug(levelSlug);
  if (!program) notFound();

  const grade = await getGradeBySlug(program.id, gradeSlug);
  if (!grade) notFound();

  const courses = await getCoursesByProgram(program.id, { gradeId: grade.id });

  return (
    <>
      <PageHeader
        title={`${grade.title} — ${program.title}`}
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Programs', href: `/${locale}/levels` },
          { label: program.title, href: `/${locale}/levels/${levelSlug}` },
          { label: grade.title },
        ]}
      />

      <Section spacing="default">
        <Container>
          <Heading level="h2" className="text-2xl sm:text-3xl">
            {locale === 'fr' ? 'Cours de ce niveau' : 'Courses in this grade'}
          </Heading>
          {courses.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {locale === 'fr'
                ? 'Aucun cours n’est encore disponible pour ce niveau.'
                : 'No courses are available in this grade yet.'}
            </p>
          ) : (
            <ul
              role="list"
              className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {courses.map((c) => (
                <li key={c.id}>
                  <CourseCard course={c} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>

      <CtaBand
        title={locale === 'fr' ? 'Une question ?' : 'Have a question?'}
        description={locale === 'fr'
          ? 'Contactez-nous pour en savoir plus.'
          : 'Get in touch to learn more.'}
        primaryHref="/contact"
        primaryLabel={locale === 'fr' ? 'Nous contacter' : 'Contact us'}
      />
    </>
  );
}

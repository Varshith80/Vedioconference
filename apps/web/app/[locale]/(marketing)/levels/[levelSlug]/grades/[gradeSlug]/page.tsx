import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { PageHeader } from '@/components/shared/page-header';
import { CourseCard } from '@/components/marketing/course-card';
import { CtaBand } from '@/components/marketing/cta-band';
import { getProgramBySlug, getGradeBySlug } from '@/services/curriculum/programs';
import { getCoursesByProgram } from '@/services/curriculum/courses';
import { localizedTitle } from '@/lib/i18n/localized-title';
import { BRAND } from '@/lib/constants/brand';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: { params: Promise<{ levelSlug: string; gradeSlug: string; locale: string }> },
): Promise<Metadata> {
  const { levelSlug, gradeSlug, locale } = await params;
  const program = await getProgramBySlug(levelSlug);
  const grade = program ? await getGradeBySlug(program.id, gradeSlug) : null;
  // Metadata uses the localized program + grade titles so
  // the <title> reflects the active locale. The runtime app
  // never reads the FR workbook's slug alias — the import is
  // keyed on the EN canonical slug, and the localized strings
  // live in `row.metadata.titles[locale]`.
  const programTitle = program
    ? localizedTitle(program, locale as 'en' | 'fr')
    : null;
  const gradeTitle = grade
    ? localizedTitle(grade, locale as 'en' | 'fr')
    : null;
  const title = gradeTitle && programTitle
    ? `${gradeTitle} · ${programTitle}`
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
  const tLevels = await getTranslations({ locale, namespace: 'Levels' });
  const tCta = await getTranslations({ locale, namespace: 'CtaBand' });

  // Pre-resolve the localized titles on the server. The
  // runtime app never reads the FR workbook's slug alias.
  const programTitle = localizedTitle(program, locale as 'en' | 'fr');
  const gradeTitle = localizedTitle(grade, locale as 'en' | 'fr');

  return (
    <>
      <PageHeader
        title={`${gradeTitle} — ${programTitle}`}
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Programs', href: `/${locale}/levels` },
          { label: programTitle, href: `/${locale}/levels/${levelSlug}` },
          { label: gradeTitle },
        ]}
      />

      <Section spacing="default">
        <Container>
          <Heading level="h2" className="text-2xl sm:text-3xl">
            {tLevels('coursesInGrade')}
          </Heading>
          {courses.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {tLevels('noCoursesInGrade')}
            </p>
          ) : (
            <ul
              role="list"
              className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {courses.map((c) => (
                <li key={c.id}>
                  <CourseCard
                    course={c}
                    displayTitle={localizedTitle(c, locale as 'en' | 'fr')}
                  />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>

      <CtaBand
        title={tCta('questionTitle')}
        description={tCta('questionDescription')}
        primaryHref="/contact"
        primaryLabel={tCta('contactLabel')}
      />
    </>
  );
}

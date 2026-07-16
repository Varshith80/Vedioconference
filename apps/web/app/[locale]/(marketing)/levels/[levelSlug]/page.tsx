import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CourseCard } from '@/components/marketing/course-card';
import { CtaBand } from '@/components/marketing/cta-band';
import { getProgramBySlug, getProgramWithGrades } from '@/services/curriculum/programs';
import { getCoursesByProgram } from '@/services/curriculum/courses';
import { localizedTitle } from '@/lib/i18n/localized-title';
import { BRAND } from '@/lib/constants/brand';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: { params: Promise<{ levelSlug: string; locale: string }> },
): Promise<Metadata> {
  const { levelSlug, locale } = await params;
  const program = await getProgramBySlug(levelSlug);
  if (!program) {
    return { title: 'Not found' };
  }
  // Metadata uses the localized program title so the
  // <title> reflects the active locale. The runtime app
  // never reads the FR workbook's slug alias — the import
  // is keyed on the EN canonical slug, and the localized
  // string lives in `program.metadata.titles[locale]`.
  const programTitle = localizedTitle(program, locale as 'en' | 'fr');
  return {
    title: `${programTitle} — ${BRAND.name}`,
    description: program.description ?? program.subtitle ?? program.title,
    alternates: { canonical: `/${locale}/levels/${levelSlug}` },
  };
}

/**
 * `/[locale]/levels/[levelSlug]` — one academic program. Renders
 * the courses that belong to the program and (for the high
 * school program) the grades as a side block. The page is
 * dynamic so the program/grade/course joins stay in sync
 * without a rebuild.
 */
export default async function LevelSlugPage(
  { params }: { params: Promise<{ levelSlug: string; locale: string }> },
) {
  const { levelSlug, locale } = await params;
  setRequestLocale(locale);

  const program = await getProgramBySlug(levelSlug);
  if (!program) notFound();

  const [withGrades, courses] = await Promise.all([
    getProgramWithGrades(program.id),
    getCoursesByProgram(program.id),
  ]);
  const grades = withGrades?.grades ?? [];
  const tLevels = await getTranslations({ locale, namespace: 'Levels' });
  const tCta = await getTranslations({ locale, namespace: 'CtaBand' });

  // Pre-resolve the localized program title on the server.
  // The runtime app never reads the FR workbook's slug alias.
  const programTitle = localizedTitle(program, locale as 'en' | 'fr');

  return (
    <>
      <PageHeader
        title={programTitle}
        description={program.subtitle ?? program.description ?? ''}
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Programs', href: `/${locale}/levels` },
          { label: programTitle },
        ]}
      />

      <Section spacing="default">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <Heading level="h2" className="text-2xl sm:text-3xl">
                {tLevels('coursesInProgram')}
              </Heading>
              {courses.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  {tLevels('noCoursesInProgram')}
                </p>
              ) : (
                <ul
                  role="list"
                  className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
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
            </div>

            {grades.length > 0 ? (
              <aside className="lg:col-span-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <GraduationCap className="h-4 w-4" aria-hidden="true" />
                      {tLevels('gradesTitle')}
                    </CardTitle>
                    <CardDescription>
                      {tLevels('gradesSubtitle')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {grades.map((g) => (
                      <Link
                        key={g.id}
                        href={`/${locale}/levels/${levelSlug}/grades/${g.slug}`}
                        className="flex items-center justify-between gap-3 rounded-md border bg-background p-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span>{localizedTitle(g, locale as 'en' | 'fr')}</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              </aside>
            ) : null}
          </div>
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

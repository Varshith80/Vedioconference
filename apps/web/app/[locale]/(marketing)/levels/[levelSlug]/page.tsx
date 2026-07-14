import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
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
  return {
    title: `${program.title} — ${BRAND.name}`,
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

  return (
    <>
      <PageHeader
        title={program.title}
        description={program.subtitle ?? program.description ?? ''}
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Programs', href: `/${locale}/levels` },
          { label: program.title },
        ]}
      />

      <Section spacing="default">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <Heading level="h2" className="text-2xl sm:text-3xl">
                {locale === 'fr' ? 'Cours de ce programme' : 'Courses in this program'}
              </Heading>
              {courses.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  {locale === 'fr'
                    ? 'Aucun cours n’est encore disponible pour ce programme.'
                    : 'No courses are available in this program yet.'}
                </p>
              ) : (
                <ul
                  role="list"
                  className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
                >
                  {courses.map((c) => (
                    <li key={c.id}>
                      <CourseCard course={c} />
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
                      {locale === 'fr' ? 'Niveaux' : 'Grades'}
                    </CardTitle>
                    <CardDescription>
                      {locale === 'fr'
                        ? 'Filtrez par niveau.'
                        : 'Filter by grade.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {grades.map((g) => (
                      <Link
                        key={g.id}
                        href={`/${locale}/levels/${levelSlug}/grades/${g.slug}`}
                        className="flex items-center justify-between gap-3 rounded-md border bg-background p-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span>{g.title}</span>
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
        title={locale === 'fr' ? 'Une question ?' : 'Have a question?'}
        description={locale === 'fr'
          ? 'Contactez-nous pour en savoir plus sur ce programme.'
          : 'Get in touch to learn more about this program.'}
        primaryHref="/contact"
        primaryLabel={locale === 'fr' ? 'Nous contacter' : 'Contact us'}
      />
    </>
  );
}

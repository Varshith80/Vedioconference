import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { CtaBand } from '@/components/marketing/cta-band';
import { JsonLd } from '@/components/marketing/jsonld';
import { SectionEyebrow } from '@/components/marketing/section-eyebrow';
import { ProgramCard } from '@/components/marketing/program-card';
import { BRAND } from '@/lib/constants/brand';
import { localizedTitle } from '@/lib/i18n/localized-title';
import { getPublishedPrograms, getProgramWithGrades } from '@/services/curriculum/programs';
import { getCoursesByProgram } from '@/services/curriculum/courses';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const tLevels = await getTranslations({ locale, namespace: 'Levels' });
  return {
    title: `${tLevels('h1')} — ${BRAND.name}`,
    description: tLevels('intro'),
    alternates: { canonical: `/${locale}/levels` },
  };
}

/**
 * `/[locale]/levels` — the program's index. One card per
 * published program, deep-linking into the per-program page.
 *
 * The page is data-driven: it iterates `getPublishedPrograms()`
 * from the curriculum service. The deep-link page
 * (`/[locale]/levels/[levelSlug]`) does the same, so the two
 * cannot drift. The runtime app never hardcodes program names
 * or slugs — every card and every href comes from the DB.
 *
 * For each program we resolve:
 *  - `displayTitle`: the localized program title (EN canonical
 *    or FR `metadata.titles.fr.title`), so `/fr` shows the
 *    French title without any client-side switching.
 *  - `courseCount`: number of published courses via
 *    `getCoursesByProgram(program.id)`.
 *  - `gradeCount`: number of grades via
 *    `getProgramWithGrades(program.id)`. Only the high-school
 *    program has grades today; other programs render without
 *    the grade line.
 *  - `href`: `/[locale]/levels/[program.slug]`. Always points
 *    to a real route; no `/contact` fallback (the legacy
 *    fallback is removed — see Sprint 3.7 routing RCA).
 *  - `coursesLabel` / `gradesLabel`: pre-resolved via the
 *    ICU plural rules in the `Levels` i18n namespace.
 */
export default async function LevelsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tLevels = await getTranslations({ locale, namespace: 'Levels' });
  const programs = await getPublishedPrograms();

  // Pre-resolve per-program data on the server. The card is
  // presentational; the page does the i18n and DB joins.
  const cards = await Promise.all(
    programs.map(async (p) => {
      const [courses, withGrades] = await Promise.all([
        getCoursesByProgram(p.id),
        getProgramWithGrades(p.id),
      ]);
      const courseCount = courses.length;
      const gradeCount = withGrades?.grades.length ?? 0;
      return {
        program: p,
        courseCount,
        gradeCount,
        displayTitle: localizedTitle(p, locale as 'en' | 'fr'),
        coursesLabel: tLevels('coursesCount', { n: courseCount }),
        gradesLabel:
          gradeCount > 0 ? tLevels('gradesCount', { n: gradeCount }) : undefined,
        exploreLabel: tLevels('exploreCta'),
        href: `/${locale}/levels/${p.slug}`,
      };
    }),
  );

  return (
    <>
      <Section spacing="tight" aria-labelledby="levels-title">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <SectionEyebrow label={tLevels('eyebrow')} />
            <Heading id="levels-title" level="h1" className="mt-4 text-balance">
              {tLevels('h1')}
            </Heading>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {tLevels('intro')}
            </p>
          </div>
        </Container>
      </Section>

      <Section
        spacing="default"
        tone="muted"
        aria-label={tLevels('sectionAria')}
      >
        <Container>
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tLevels('noCoursesInProgram')}</p>
          ) : (
            <ul
              role="list"
              className="grid grid-cols-1 gap-6 sm:gap-7 md:grid-cols-2"
            >
              {cards.map(
                ({
                  program,
                  courseCount,
                  gradeCount,
                  displayTitle,
                  coursesLabel,
                  gradesLabel,
                  exploreLabel,
                  href,
                }) => (
                  <li key={program.id} className="relative">
                    <ProgramCard
                      program={program}
                      courseCount={courseCount}
                      gradeCount={gradeCount}
                      href={href}
                      displayTitle={displayTitle}
                      coursesLabel={coursesLabel}
                      gradesLabel={gradesLabel}
                      exploreLabel={exploreLabel}
                    />
                  </li>
                ),
              )}
            </ul>
          )}
        </Container>
      </Section>

      <CtaBand
        title={tLevels('ctaTitle')}
        description={tLevels('ctaDescription')}
        primaryHref="/contact"
        primaryLabel={tLevels('ctaPrimary')}
        secondaryHref="/tutors"
        secondaryLabel={tLevels('ctaSecondary')}
      />

      <JsonLd
        id="levels-faq"
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: tLevels('jsonLdName', { brand: BRAND.name }),
          itemListElement: cards.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.displayTitle,
            description: c.program.subtitle ?? c.program.description ?? '',
            url: `/${locale}/levels/${c.program.slug}`,
          })),
        }}
      />
    </>
  );
}

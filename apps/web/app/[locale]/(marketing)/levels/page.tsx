import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Button } from '@/components/ui/button';
import { CtaBand } from '@/components/marketing/cta-band';
import { JsonLd } from '@/components/marketing/jsonld';
import { LevelChip } from '@/components/marketing/level-chip';
import { SectionEyebrow } from '@/components/marketing/section-eyebrow';
import { BRAND } from '@/lib/constants/brand';
import { getLearningPaths } from '@/lib/i18n/paths';
import { getPublishedPrograms } from '@/services/curriculum/programs';

export const revalidate = 60;

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
 * Levels page. One card per learning path with the level
 * programme. All localised copy comes from the active locale's
 * `Homepage.paths` (the same array the home page uses), so the
 * home page and this page never drift.
 */
export default async function LevelsPage() {
  const tLevels = await getTranslations('Levels');
  const tHome = await getTranslations('Homepage');
  const paths = getLearningPaths(tHome);

  // The i18n cards (lycee / prepa / bts / licence) and the
  // v2 `programs` table are NOT a 1:1 map. The DB has only
  // the two programs we ship today (`high_school` and
  // `preparatory`); the other two cards are forward-looking
  // and have no catalog yet. We resolve the mapping once,
  // server-side, so the per-card CTA either:
  //   - jumps to the per-program page (`/levels/{slug}`) when
  //     the program exists in the DB, OR
  //   - falls back to `/contact` when the program does not
  //     exist (BTS, Licence) so the user is never on a dead
  //     button.
  const programs = await getPublishedPrograms();
  const programSlugByTrack: Record<string, string> = {
    lycee: 'high_school',
    prepa: 'preparatory',
  };
  const knownSlugs = new Set(programs.map((p) => p.slug));

  return (
    <>
      <Section spacing="default" aria-labelledby="levels-title">
        <Container size="prose">
          <SectionEyebrow label={tLevels('eyebrow')} />
          <Heading id="levels-title" level="h1" className="mt-4">
            {tLevels('h1')}
          </Heading>
          <p className="mt-5 text-base text-muted-foreground sm:text-lg">
            {tLevels('intro')}
          </p>
        </Container>
      </Section>

      <Section spacing="default" tone="muted" aria-label={tLevels('sectionAria')}>
        <Container>
          <ul role="list" className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {paths.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-4 rounded-lg border bg-card p-6 shadow-sm sm:p-8"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <LevelChip label={p.badge} />
                  <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {p.headline}
                  </span>
                </div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {p.level}
                </h2>
                <p className="text-pretty text-sm text-muted-foreground sm:text-base">
                  {p.blurb}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
                  {p.subjects}
                </p>
                <div className="mt-2">
                  {(() => {
                    const targetSlug = programSlugByTrack[p.id];
                    const hasProgram = !!targetSlug && knownSlugs.has(targetSlug);
                    const href = hasProgram
                      ? `/levels/${targetSlug}`
                      : '/contact';
                    const label = hasProgram
                      ? tLevels('browseProgram')
                      : tLevels('requestQuote');
                    return (
                      <Button asChild variant="outline" size="sm">
                        <Link href={href}>
                          {label}
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </Button>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>
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
          name: `Programs offered by ${BRAND.name}`,
          itemListElement: paths.map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: p.level,
            description: p.blurb,
          })),
        }}
      />
    </>
  );
}

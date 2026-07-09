import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Button } from '@/components/ui/button';
import { CtaBand } from '@/components/marketing/cta-band';
import { JsonLd } from '@/components/marketing/jsonld';
import { LevelChip } from '@/components/marketing/level-chip';
import { SectionEyebrow } from '@/components/marketing/section-eyebrow';
import { LEARNING_PATHS, BRAND } from '@/lib/constants/brand';

export const revalidate = 60;

export const metadata: Metadata = {
  title: `Niveaux — ${BRAND.name}`,
  description:
    'Quatre parcours : Lycée, Prépa, BTS, Licence. Programmes alignés, profs vérifiés, cours en visio.',
  alternates: { canonical: '/levels' },
};

/**
 * Niveaux page. One card per learning path with the level
 * programme. All copy is sourced from the brand module so the
 * home page and this page never drift.
 */
export default function LevelsPage() {
  return (
    <>
      <Section spacing="default" aria-labelledby="levels-title">
        <Container size="prose">
          <SectionEyebrow label="Niveaux" />
          <Heading id="levels-title" level="h1" className="mt-4">
            Quatre parcours, un seul niveau d’exigence.
          </Heading>
          <p className="mt-5 text-base text-muted-foreground sm:text-lg">
            Lycée, classes préparatoires, BTS, licence&nbsp;: chaque
            parcours a son programme, ses exercices, et ses profs
            habitués aux attendus. Choisissez le vôtre, le reste
            suit.
          </p>
        </Container>
      </Section>

      <Section spacing="default" tone="muted" aria-label="Détail des parcours">
        <Container>
          <ul role="list" className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {LEARNING_PATHS.map((p) => (
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
                  <Button asChild variant="outline" size="sm">
                    <Link href="/contact">
                      Demander un devis
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <CtaBand
        title="Une question sur votre niveau ?"
        description="Écrivez-nous, on vous oriente vers le bon parcours et le bon prof — sans engagement."
        primaryHref="/contact"
        primaryLabel="Nous écrire"
        secondaryHref="/tutors"
        secondaryLabel="Voir les tuteurs"
      />

      <JsonLd
        id="levels-faq"
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `Niveaux proposés par ${BRAND.name}`,
          itemListElement: LEARNING_PATHS.map((p, i) => ({
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

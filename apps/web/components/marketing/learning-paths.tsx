import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { LevelChip } from './level-chip';
import { SectionEyebrow } from './section-eyebrow';
import { LEARNING_PATHS } from '@/lib/constants/brand';

/**
 * Section 01 — Parcours. Four learning paths (Lycée, Prépa, BTS,
 * Licence). Copy is verbatim from the client brief.
 */
export function LearningPaths() {
  return (
    <Section
      aria-labelledby="parcours-title"
      className="bg-background"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center sm:text-left">
          <SectionEyebrow number="01" label="Parcours" />
          <Heading
            id="parcours-title"
            level="h2"
            className="mt-3 text-3xl font-bold sm:text-4xl"
          >
            Quatre parcours, un seul niveau d’exigence.
          </Heading>
          <p className="mt-3 text-pretty text-base text-muted-foreground sm:text-lg">
            Du lycée à la licence, nous accompagnons chaque élève avec un
            contenu calibré sur le programme officiel et les concours visés.
          </p>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {LEARNING_PATHS.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-3 rounded-lg border bg-card p-6 shadow-sm"
            >
              <LevelChip label={p.badge} />
              <h3 className="font-heading text-xl font-semibold tracking-tight text-foreground">
                {p.level}
              </h3>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {p.headline}
              </p>
              <p className="text-pretty text-sm text-muted-foreground">{p.blurb}</p>
              <p className="mt-auto pt-2 text-xs font-medium text-foreground/80">
                {p.subjects}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-10 text-center sm:text-left">
          <Link
            href="/levels"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--brand-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Voir les détails par niveau
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </Container>
    </Section>
  );
}

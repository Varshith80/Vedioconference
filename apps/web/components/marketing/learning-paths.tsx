import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { LevelChip } from './level-chip';
import { SectionEyebrow } from './section-eyebrow';
import type { LocalisedLearningPath } from '@/lib/i18n/paths';

type LearningPathsProps = {
  /** Eyebrow above the section title, e.g. "01 — Tracks". */
  eyebrow: string;
  /** Section title. */
  title: string;
  /** Intro paragraph. */
  intro: string;
  /** Trailing "see the details by level" link label. */
  seeAllLabel: string;
  /** The four (or N) paths to render. */
  paths: ReadonlyArray<LocalisedLearningPath>;
};

/**
 * Section 01 — Parcours. Pure presentational: every string comes
 * from the active locale's message file. The four learning paths
 * are passed in as `paths` so the same component is shared between
 * the home page and the `/levels` page.
 */
export function LearningPaths({ eyebrow, title, intro, seeAllLabel, paths }: LearningPathsProps) {
  return (
    <Section
      aria-labelledby="parcours-title"
      className="bg-background"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center sm:text-left">
          <SectionEyebrow number="01" label={eyebrow} />
          <Heading
            id="parcours-title"
            level="h2"
            className="mt-3 text-3xl font-bold sm:text-4xl"
          >
            {title}
          </Heading>
          <p className="mt-3 text-pretty text-base text-muted-foreground sm:text-lg">
            {intro}
          </p>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {paths.map((p) => (
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
            {seeAllLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </Container>
    </Section>
  );
}

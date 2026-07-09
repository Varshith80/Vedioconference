import * as React from 'react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { MethodStep } from './method-step';
import { SectionEyebrow } from './section-eyebrow';
import type { LocalisedMethodStep } from '@/lib/i18n/paths';

type TeachingMethodProps = {
  /** Eyebrow above the section title, e.g. "02 — Method". */
  eyebrow: string;
  /** Section title. */
  title: string;
  /** Intro paragraph. */
  intro: string;
  /** The three method bricks to render. */
  steps: ReadonlyArray<LocalisedMethodStep>;
};

/**
 * Section 02 — Méthode. Three numbered steps. Pure presentational;
 * the copy comes from the active locale's message file.
 */
export function TeachingMethod({ eyebrow, title, intro, steps }: TeachingMethodProps) {
  return (
    <Section
      aria-labelledby="methode-title"
      className="bg-muted/40"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center sm:text-left">
          <SectionEyebrow number="02" label={eyebrow} />
          <Heading
            id="methode-title"
            level="h2"
            className="mt-3 text-3xl font-bold sm:text-4xl"
          >
            {title}
          </Heading>
          <p className="mt-3 text-pretty text-base text-muted-foreground sm:text-lg">
            {intro}
          </p>
        </div>

        <ol className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map((step) => (
            <li key={step.n}>
              <MethodStep n={step.n} title={step.title} body={step.body} />
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}

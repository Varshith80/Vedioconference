import * as React from 'react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { MethodStep } from './method-step';
import { SectionEyebrow } from './section-eyebrow';
import { METHOD_STEPS } from '@/lib/constants/brand';

/**
 * Section 02 — Méthode. Three steps (Cours en visio, Exercices
 * corrigés pas-à-pas, Suivi de progression). Copy is verbatim from
 * the client brief.
 */
export function TeachingMethod() {
  return (
    <Section
      aria-labelledby="methode-title"
      className="bg-muted/40"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center sm:text-left">
          <SectionEyebrow number="02" label="Méthode" />
          <Heading
            id="methode-title"
            level="h2"
            className="mt-3 text-3xl font-bold sm:text-4xl"
          >
            Une méthode en trois temps.
          </Heading>
          <p className="mt-3 text-pretty text-base text-muted-foreground sm:text-lg">
            Pas de cours magistraux enregistrés. Chaque séance est pensée pour
            que vous progressiez réellement, séance après séance.
          </p>
        </div>

        <ol className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {METHOD_STEPS.map((step) => (
            <li key={step.n}>
              <MethodStep n={step.n} title={step.title} body={step.body} />
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}

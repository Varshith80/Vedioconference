import * as React from 'react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { SectionEyebrow } from './section-eyebrow';
import { cn } from '@/lib/utils/cn';

export interface HowStep {
  readonly n: string;
  readonly title: string;
  readonly body: string;
  readonly detail?: string;
}

interface HowItWorksProps {
  eyebrow: string;
  title: string;
  intro: string;
  steps: ReadonlyArray<HowStep>;
}

/**
 * How it works. A 4-step process with a connecting line on
 * `md`+, stacked on mobile. The eyebrow is numbered ("01 — Process")
 * to match the visual rhythm of the rest of the page.
 *
 * Server-rendered, no client JS.
 */
export function HowItWorks({ eyebrow, title, intro, steps }: HowItWorksProps) {
  return (
    <Section
      id="how-it-works"
      spacing="default"
      className="bg-muted/30"
      aria-labelledby="how-title"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center sm:text-left">
          <SectionEyebrow label={eyebrow} />
          <Heading id="how-title" level="h2" className="mt-3 text-3xl font-bold sm:text-4xl">
            {title}
          </Heading>
          <p className="mt-3 text-pretty text-base text-muted-foreground sm:text-lg">{intro}</p>
        </div>

        <ol
          role="list"
          className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-4 md:gap-0"
        >
          {steps.map((step, i) => (
            <li
              key={step.n}
              className={cn(
                'relative flex flex-col gap-3 md:px-6',
                i > 0 && 'md:border-l md:border-border/60',
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary font-mono text-sm font-semibold text-primary-foreground shadow-sm"
                  aria-hidden="true"
                >
                  {step.n}
                </span>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Étape {step.n}
                </span>
              </div>
              <h3 className="font-heading text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.body}</p>
              {step.detail && (
                <p className="mt-1 text-xs text-foreground/70">{step.detail}</p>
              )}
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}

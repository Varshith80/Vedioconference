'use client';

import * as React from 'react';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { cn } from '@/lib/utils/cn';

export interface FaqItem {
  readonly q: string;
  readonly a: string;
}

interface FaqProps {
  eyebrow: string;
  title: string;
  intro: string;
  items: ReadonlyArray<FaqItem>;
  contactLabel: string;
  contactHref: string;
}

/**
 * FAQ section. A small, controlled accordion. Each item is a
 * `<button>` for keyboard reachability; `aria-expanded` and
 * `aria-controls` are wired up. The expanded panel uses
 * `id=...`-based reveal so the content is in the DOM and
 * indexable, but visually hidden when collapsed.
 */
export function Faq({ eyebrow, title, intro, items, contactLabel, contactHref }: FaqProps) {
  // The first item is open by default — gives the page rhythm on
  // first paint and matches what most modern SaaS marketing pages
  // do (Stripe, Linear, Vercel all open the first FAQ).
  const [open, setOpen] = useState<number>(0);

  return (
    <Section id="faq" spacing="default" aria-labelledby="faq-title">
      <Container size="prose">
        <div className="text-center">
          <p className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-accent)]">
            {eyebrow}
          </p>
          <Heading id="faq-title" level="h2" className="mt-3 text-3xl font-bold sm:text-4xl">
            {title}
          </Heading>
          <p className="mt-3 text-pretty text-base text-muted-foreground sm:text-lg">{intro}</p>
        </div>

        <ul role="list" className="mt-10 divide-y divide-border/60 rounded-2xl border bg-card shadow-sm">
          {items.map((item, i) => {
            const panelId = `faq-panel-${i}`;
            const btnId = `faq-button-${i}`;
            const isOpen = open === i;
            return (
              <li key={item.q}>
                <h3>
                  <button
                    id={btnId}
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left text-base font-semibold text-foreground transition-colors hover:bg-muted/40 sm:px-6"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                  >
                    <span className="text-balance">{item.q}</span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                        isOpen && 'rotate-180 text-foreground',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  hidden={!isOpen}
                  className="px-5 pb-5 text-sm text-muted-foreground sm:px-6 sm:pb-6 sm:text-base"
                >
                  {item.a}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          {contactLabel}{' '}
          <a
            href={contactHref}
            className="font-semibold text-[color:var(--brand-accent)] underline-offset-4 hover:underline"
          >
            {contactHref}
          </a>
          .
        </p>
      </Container>
    </Section>
  );
}

import * as React from 'react';
import { Container } from '@/components/shared/container';

/**
 * Trust bar. A subdued band that says "trusted by" with a row of
 * fictional partner / institution names rendered as text. We don't
 * use real logos in the marketing site (we'd be making claims we
 * can't substantiate) — text-only is honest and looks like a
 * modern SaaS marketing page.
 *
 * Server-rendered, no client JS.
 */
export function TrustBar({ items }: { items: ReadonlyArray<string> }) {
  if (items.length === 0) return null;
  return (
    <section
      aria-label="Ils nous font confiance"
      className="border-y border-border/60 bg-background/60 py-8 sm:py-10"
    >
      <Container>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Ils apprennent avec Intégrale
        </p>
        <ul
          role="list"
          className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:gap-x-12"
        >
          {items.map((name) => (
            <li
              key={name}
              className="font-heading text-base font-semibold tracking-tight text-foreground/70 sm:text-lg"
            >
              {name}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

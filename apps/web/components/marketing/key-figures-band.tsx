import * as React from 'react';
import { Container } from '@/components/shared/container';
import { Stat } from './stat';
import type { LocalisedKeyFigure } from '@/lib/i18n/paths';

type KeyFiguresBandProps = {
  /** Accessible name for the section. */
  ariaLabel: string;
  /** The three (or N) figures to render. */
  figures: ReadonlyArray<LocalisedKeyFigure>;
};

/**
 * Chiffres-clés band. Lives on a Bleu Plan surface so the stat
 * values pop. Single horizontal row on `md`+, stacked on mobile.
 */
export function KeyFiguresBand({ ariaLabel, figures }: KeyFiguresBandProps) {
  return (
    <section
      aria-label={ariaLabel}
      className="bg-brand-gradient text-primary-foreground"
    >
      <Container className="py-12 sm:py-14">
        <dl className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-10">
          {figures.map((fig) => (
            <div key={fig.label} className="flex flex-col items-start gap-1">
              <Stat value={fig.value} label={fig.label} tone="invert" />
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

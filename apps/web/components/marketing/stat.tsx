import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface StatProps {
  /** The big numeric value, e.g. "3 400+", "100%", "4". */
  value: string;
  /** A short label rendered under the value. */
  label: string;
  /** Foreground tone. */
  tone?: 'default' | 'invert';
  className?: string;
}

/**
 * A single key-figure stat (value + label) used in the "chiffres
 * clés" band. Value is in Plex Serif (display weight); label is in
 * Plex Sans. When `invert` the band is meant to live on a Bleu
 * Plan surface.
 */
export function Stat({ value, label, tone = 'default', className }: StatProps) {
  const fg = tone === 'invert' ? 'text-primary-foreground' : 'text-foreground';
  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      <span className={cn('font-heading text-4xl font-bold leading-none sm:text-5xl', fg)}>
        {value}
      </span>
      <span
        className={cn(
          'text-sm sm:text-base',
          tone === 'invert' ? 'text-primary-foreground/85' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </div>
  );
}

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface SectionEyebrowProps {
  /** Numbered label such as "01", "02", "03" — rendered in Plex Mono. */
  number?: string;
  /** Short uppercase label, e.g. "PARCOURS" or "MÉTHODE". */
  label: string;
  /** Optional tone override. Default is Bleu Plan. */
  tone?: 'default' | 'invert' | 'accent';
  className?: string;
}

const TONE = {
  default: 'text-foreground',
  invert:  'text-primary-foreground',
  accent:  'text-[color:var(--brand-accent)]',
} as const;

/**
 * The small numbered/uppercase label that sits above each major
 * section heading. Uses the Plex Mono family for the number and the
 * Plex Sans family for the label, per the brand brief.
 */
export function SectionEyebrow({ number, label, tone = 'default', className }: SectionEyebrowProps) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em]',
        TONE[tone],
        className,
      )}
    >
      {number && (
        <span className="font-mono text-[0.95em] tracking-normal" aria-hidden="true">
          {number}
        </span>
      )}
      <span>{label}</span>
    </p>
  );
}

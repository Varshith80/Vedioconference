import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface LevelChipProps {
  /** The visible label, e.g. "LYCÉE", "PRÉPA", "BTS", "LICENCE". */
  label: string;
  /** Optional tone. Default is the foreground tone. */
  tone?: 'default' | 'invert';
  /** Optional className passthrough. */
  className?: string;
}

/**
 * A small uppercase pill chip used to label learning paths and
 * other categorical metadata. Rendered in Plex Mono per the
 * brand brief — numbers, badges, and labels live in mono.
 */
export function LevelChip({ label, tone = 'default', className }: LevelChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.14em]',
        tone === 'invert'
          ? 'border-primary-foreground/30 text-primary-foreground'
          : 'border-foreground/20 text-foreground/80',
        className,
      )}
    >
      {label}
    </span>
  );
}

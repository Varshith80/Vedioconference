import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface LivePillProps {
  /** Visible label, e.g. "Cours en direct", "En direct". */
  label?: string;
  /** Optional className passthrough. */
  className?: string;
}

/**
 * A small pill that signals "live / now". A green dot (Vert
 * Réactif) pulses via a CSS animation; the animation respects
 * `prefers-reduced-motion` because the keyframes check the
 * media query at the global stylesheet level.
 */
export function LivePill({ label = 'Cours en direct', className }: LivePillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-[color:var(--brand-accent)]/30 bg-[color:var(--brand-accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-accent)]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="live-pill-dot relative inline-block h-2 w-2 rounded-full bg-[color:var(--brand-accent)]"
      />
      <span>{label}</span>
    </span>
  );
}

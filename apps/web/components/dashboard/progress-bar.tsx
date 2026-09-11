import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface ProgressBarProps {
  /** 0..100. Clamped at render time. */
  value: number;
  /** Accessible label for the meter (required for a11y). */
  label: string;
  /** Optional visual size variant. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Slim, presentational progress meter. Uses native
 * `role="progressbar"` + `aria-valuenow/min/max` so it
 * is announced correctly by screen readers, and a plain
 * `div` for the visible bar so it can be styled with the
 * existing design tokens.
 *
 * Intentionally a pure component — no data fetching —
 * so it can be reused by the dashboard home, the
 * programs page, and any future surface.
 */
export function ProgressBar({
  value,
  label,
  size = 'md',
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const trackH = size === 'sm' ? 'h-1.5' : 'h-2';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('w-full', className)}
    >
      <div
        className={cn(
          'w-full overflow-hidden rounded-full bg-muted',
          trackH,
        )}
      >
        <div
          className="h-full rounded-full bg-[color:var(--brand-accent)] transition-[width] duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

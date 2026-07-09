import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface MethodStepProps {
  /** The step number, e.g. "01", "02", "03". */
  n: string;
  /** Step title. */
  title: string;
  /** Step body copy. */
  body: string;
  className?: string;
}

/**
 * One brick in the "Notre méthode" 3-step section. The number is
 * rendered large in Plex Mono, the title in Plex Serif, the body
 * in Plex Sans.
 */
export function MethodStep({ n, title, body, className }: MethodStepProps) {
  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-card p-6 shadow-sm sm:p-8',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="font-mono text-3xl font-semibold text-[color:var(--brand-primary)] sm:text-4xl"
      >
        {n}
      </span>
      <h3 className="font-heading text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {title}
      </h3>
      <p className="text-pretty text-sm text-muted-foreground sm:text-base">{body}</p>
    </article>
  );
}

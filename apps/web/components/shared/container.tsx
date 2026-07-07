import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Max-width preset. `default` = 1280px, `prose` = 65ch for text pages. */
  size?: 'default' | 'prose' | 'wide' | 'narrow';
}

/**
 * Page-level horizontal container. Uses the Tailwind `container` class
 * configured in `tailwind.config.ts` and is responsive at every
 * breakpoint (mobile → 2xl). `prose` is for long-form text.
 */
export function Container({ className, size = 'default', ...props }: ContainerProps) {
  const sizeClass =
    size === 'prose'
      ? 'max-w-prose'
      : size === 'narrow'
        ? 'max-w-3xl'
        : size === 'wide'
          ? 'max-w-[1400px]'
          : 'max-w-7xl';
  return <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', sizeClass, className)} {...props} />;
}

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface LoadingSpinnerProps {
  /** Visual size. Default = md. */
  size?: 'sm' | 'md' | 'lg';
  /** Label announced to assistive tech. */
  label?: string;
  className?: string;
}

const SIZES: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
};

/**
 * Spinner used for inline loading. For page-level loading prefer
 * the route-level `loading.tsx` boundary + `<Skeleton />`.
 */
export function LoadingSpinner({
  size = 'md',
  label = 'Chargement…',
  className,
}: LoadingSpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('inline-flex items-center gap-2 text-muted-foreground', className)}
    >
      <Loader2 className={cn('animate-spin', SIZES[size])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

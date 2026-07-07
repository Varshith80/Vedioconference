import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Container } from './container';
import { cn } from '@/lib/utils/cn';

interface ErrorStateProps {
  title?: string;
  description?: React.ReactNode;
  /** Optional retry handler. If omitted, no button is rendered. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Generic error block used by route-level `error.tsx` files and by
 * any client component that wants to surface a recoverable failure.
 */
export function ErrorState({
  title = 'Une erreur est survenue',
  description = 'Veuillez réessayer. Si le problème persiste, contactez le support.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <Container className={cn('py-12 sm:py-16', className)}>
      <div
        role="alert"
        className="mx-auto flex max-w-xl flex-col items-center rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center sm:p-8"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive sm:h-14 sm:w-14">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-foreground sm:text-xl">{title}</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Réessayer
          </button>
        )}
      </div>
    </Container>
  );
}

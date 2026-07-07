import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Optional primary CTA. Pass either an href (renders <Link>) or onClick. */
  action?:
    | { label: string; href: string }
    | { label: string; onClick: () => void };
  className?: string;
}

/**
 * Generic empty-state block. Reused by the dashboard placeholder
 * pages and by every list page that might be empty in Phase 2.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-6 py-12 text-center sm:py-16',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary sm:h-14 sm:w-14">
          {icon}
        </div>
      )}
      <h2 className="text-base font-semibold text-foreground sm:text-lg">{title}</h2>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && (
        <div className="mt-6">
          {'href' in action ? (
            <Link
              href={action.href}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

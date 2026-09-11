import * as React from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils/cn';

// =====================================================================
// Sprint 9 — Admin Portal error-state distinction.
//
// `AdminListPage` (and the rest of the read-only admin chrome) used
// to render the empty state when a Supabase read failed, because
// every service in `services/admin/catalog.ts` swallowed errors to
// `[]`. That made a degraded database look identical to "no data"
// and gave the operator no signal that something was broken.
//
// The fix is the typed envelope below: every read service returns
// `{ data, error }` instead of just `[]`. Pages pass the envelope
// into `AdminDataState`, which picks the right view:
//
//   - loading → spinner + label
//   - error   → destructive icon + message + a Retry button
//   - empty   → existing EmptyState card
//   - data    → the children (the table, the grid, …)
//
// Loading is opt-in: RSC pages resolve the data before render so the
// default state is one of `data / empty / error`. The "loading"
// branch is wired for client-side fetches (refreshing after a
// mutation) and for any future page that streams.
// =====================================================================

/**
 * Admin read result. Always one of:
 *   - { state: 'data', data }
 *   - { state: 'empty' }
 *   - { state: 'loading' }
 *   - { state: 'error', message, code? }
 *
 * Built by `adminFetchResult()` from the read services; pages
 * construct it via `useAdminFetch()` on the client.
 */
export type AdminFetchResult<T> =
  | { state: 'data'; data: ReadonlyArray<T> }
  | { state: 'empty' }
  | { state: 'loading' }
  | { state: 'error'; message: string; code?: string };

/**
 * Coerce a service return value (which may still be just an
 * array — old callers) plus an optional `error` into the
 * typed envelope.
 *
 *   adminFetchResult(rows)            // { state: rows.length ? 'data' : 'empty' }
 *   adminFetchResult(null, error)     // { state: 'error', message, code }
 *   adminFetchResult(undefined)       // { state: 'loading' }  // pre-resolve
 */
export function adminFetchResult<T>(
  rows: ReadonlyArray<T> | null | undefined,
  error?: { message: string; code?: string } | null,
): AdminFetchResult<T> {
  if (error) {
    return { state: 'error', message: error.message, code: error.code };
  }
  if (rows == null) {
    return { state: 'loading' };
  }
  if (rows.length === 0) {
    return { state: 'empty' };
  }
  return { state: 'data', data: rows };
}

export interface AdminDataStateProps<T> {
  result: AdminFetchResult<T>;
  // Shown when `state === 'empty'`.
  empty: string;
  emptyIcon: React.ReactNode;
  // Localised chrome labels. The component does not call
  // `useTranslations()` so it can be rendered in unit tests
  // without a `NextIntlClientProvider`. The parent reads
  // `Admin.common` once and passes the strings down.
  labels: {
    loading: string;
    loadErrorTitle: string;
    retry: string;
  };
  // Called when the user presses "Retry" on an error state.
  // When provided, the error card shows it.
  onRetry?: () => void;
  // Called when the user presses "Refresh" on a loading state
  // (uncommon — the default is the spinner).
  onRefresh?: () => void;
  children: (data: ReadonlyArray<T>) => React.ReactNode;
  className?: string;
}

/**
 * Renders the right admin view for an `AdminFetchResult`.
 *
 * Used by:
 *   - `AdminListPage` (catalog + finance + students)
 *   - the admin overview counters page
 *   - any future admin surface that wants the same UX
 */
export function AdminDataState<T>({
  result,
  empty,
  emptyIcon,
  labels,
  onRetry,
  children,
  className,
}: AdminDataStateProps<T>): React.JSX.Element {
  if (result.state === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'flex items-center justify-center gap-2 rounded-md border bg-card p-6 text-sm text-muted-foreground',
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden={true} />
        <span>{labels.loading}</span>
      </div>
    );
  }

  if (result.state === 'error') {
    return (
      <div
        role="alert"
        className={cn(
          'flex flex-col items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-6 text-sm',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden={true} />
          <span className="font-medium">{labels.loadErrorTitle}</span>
        </div>
        <p className="text-muted-foreground">{result.message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 rounded-md border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {labels.retry}
          </button>
        ) : null}
      </div>
    );
  }

  if (result.state === 'empty') {
    return (
      <div className={cn('mt-10', className)}>
        <EmptyState icon={emptyIcon} title={empty} description="" />
      </div>
    );
  }

  return <>{children(result.data)}</>;
}

/**
 * Tiny "empty" helper for admin pages that haven't adopted
 * `AdminDataState` yet. Renders a centered Inbox card.
 */
export function AdminInlineEmpty({
  message,
  className,
}: {
  message: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 rounded-md border bg-card p-6 text-sm text-muted-foreground',
        className,
      )}
    >
      <Inbox className="h-4 w-4" aria-hidden={true} />
      <span>{message}</span>
    </div>
  );
}
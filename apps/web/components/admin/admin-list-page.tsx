import * as React from 'react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AdminDataState,
  type AdminFetchResult,
} from '@/components/admin/admin-data-state';
import { cn } from '@/lib/utils/cn';

// Shared list-page chrome for the admin console. Every
// catalog/finance/student page (programs/grades/courses/
// chapters/sessions/payments/students) shares the same
// layout: a header (title + subline + count + optional
// "Create" action) above a data table.
//
// **Layout — Sprint 3.8 follow-up:**
// The previous card-grid layout produced inconsistent row
// heights when one row had a long title (e.g. "Algèbre
// linéaire : dualité, projecteurs, formes quadratiques")
// and the next had a short one ("Vecteurs"). The grid
// also has no width contract: the action buttons float
// against the longest cell. The pages now render a real
// HTML <table> on >= sm so every cell in a column has
// the same width, every row the same height, and the
// action column is always the same trailing width.
//
// On < sm the table collapses to a stacked key/value list
// so mobile admins (the customer said "mobile-first") can
// still see every field.

/**
 * Normalize a `renderItem` return value into the ordered
 * list of cell elements that the row maps to <td>s.
 *
 * Contract for callers: `renderItem(item)` may return
 *
 *   1. A single React.Fragment whose `props.children` is
 *      the ordered cell list (e.g. `<>…</>` JSX). The
 *      Fragment is a single React element whose children
 *      are the actual cells. `React.Children.toArray`
 *      would treat the Fragment as one child and skip
 *      the cells, so we have to descend into
 *      `props.children` ourselves.
 *   2. An array of cell elements.
 *   3. A single non-Fragment cell (used by very small
 *      lists that only need one column).
 *
 * The unwrap returns the cell list in the right order,
 * filtered to valid React elements (null / undefined /
 * booleans dropped — same shape as `Children.toArray`).
 */
function unwrapToCellList(
  raw: React.ReactNode,
): ReadonlyArray<React.ReactElement> {
  // Case 1: a single Fragment → its children are the cells.
  // We must check `type === React.Fragment` specifically
  // (and not just "has children"): any React element has a
  // `props.children` field, and treating every element as a
  // fragment would descend into the wrong subtree. The
  // `Symbol(react.fragment)` comparison is the canonical
  // runtime check (the JSX `<>…</>` desugars to
  // `React.createElement(React.Fragment, …)`).
  if (React.isValidElement(raw) && raw.type === React.Fragment) {
    const children = (raw.props as { children: React.ReactNode }).children;
    return React.Children.toArray(children).filter(
      (c): c is React.ReactElement => React.isValidElement(c),
    );
  }
  // Case 2 + 3: array of cells, or a single non-fragment cell.
  return React.Children.toArray(raw).filter(
    (c): c is React.ReactElement => React.isValidElement(c),
  );
}

interface AdminListPageProps<T> {
  title: string;
  subline: string;
  empty: string;
  emptyIcon: React.ReactNode;
  items: ReadonlyArray<T>;
  renderItem: (item: T) => React.ReactNode;
  getKey: (item: T) => string;
  // The columns to render. `width` is a Tailwind width
  // utility (e.g. "w-32", "min-w-[180px]"); it controls the
  // header cell width on >= sm. The actions column is
  // always auto-sized and right-aligned.
  columns: ReadonlyArray<{
    key: string;
    label: string;
    width?: string;
  }>;
  // Sprint 3.8 — Manual CRUD support. The header action
  // renders right of the title (typically a "Create" button).
  // The per-row actions render in the trailing column.
  headerAction?: React.ReactNode;
  actions?: (item: T) => React.ReactNode;
  // Total number of columns including the actions column.
  // Inferred from `columns.length + (actions ? 1 : 0)` but
  // exposed for the mobile stacked view to count correctly.
  mobileKeys?: ReadonlyArray<{ key: string; label: string }>;
  // When true, the row hover state is muted (used by pages
  // that don't expose per-row actions yet, e.g. read-only
  // lists). Default: true (rows highlight on hover to hint
  // that they're interactive).
  interactiveActions?: boolean;
  // Sprint 9 — P3-1 error-state distinction. When supplied,
  // the list is rendered through `AdminDataState` so a
  // Supabase failure shows a destructive card + Retry
  // instead of looking like an empty list. The `items` prop
  // is still required for backwards compatibility (used as
  // a fallback when `result` is not supplied).
  result?: AdminFetchResult<T>;
  onRetry?: () => void;
  // Localised chrome labels for the loading / error /
  // retry states. Mirrors the same prop on
  // `AdminDataState` so the component can be rendered in
  // unit tests without a `NextIntlClientProvider`.
  labels?: {
    loading: string;
    loadErrorTitle: string;
    retry: string;
  };
}

export function AdminListPage<T>({
  title,
  subline,
  empty,
  emptyIcon,
  items,
  renderItem,
  getKey,
  columns,
  headerAction,
  actions,
  mobileKeys,
  interactiveActions = true,
  result,
  onRetry,
  labels,
}: AdminListPageProps<T>) {
  const keys = mobileKeys ?? columns.map((c) => ({ key: c.key, label: c.label }));
  const dataStateLabels = labels ?? {
    loading: 'Loading…',
    loadErrorTitle: 'Could not load data',
    retry: 'Retry',
  };

  // The legacy path: `items` is supplied directly. We coerce it
  // into the typed envelope so every code path below goes
  // through `AdminDataState`. The `Badge` count in the header
  // uses `items.length` even on `error`/`loading` to give the
  // operator a hint that data was expected.
  const envelope: AdminFetchResult<T> = result ?? (
    items.length === 0
      ? { state: 'empty' }
      : { state: 'data', data: items }
  );

  const headerCount =
    envelope.state === 'data' ? envelope.data.length : items.length;

  return (
    <Section spacing="default" aria-labelledby="admin-list-title">
      <Container>
        <header className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Heading id="admin-list-title" level="h1" className="text-3xl sm:text-4xl">
                {title}
              </Heading>
              <Badge variant="outline" className="text-xs">
                {headerCount}
              </Badge>
            </div>
            {headerAction ? <div className="flex items-center gap-2">{headerAction}</div> : null}
          </div>
          <p className="mt-2 text-base text-muted-foreground">{subline}</p>
        </header>

        <AdminDataState
          result={envelope}
          empty={empty}
          emptyIcon={emptyIcon}
          labels={dataStateLabels}
          onRetry={onRetry}
        >
          {(rows) => (
            <Card>
              <CardContent className="p-0">
                {/*
                  The container is `overflow-x-auto` so the
                  table can scroll horizontally on narrow
                  viewports without breaking the column
                  layout. The `<table>` is rendered above
                  `sm:` (hidden on mobile); the stacked list
                  below is rendered below `sm:` (hidden on
                  desktop).
                */}
                <div className="overflow-x-auto">
                  <table className="hidden w-full text-sm sm:table">
                    <thead>
                      <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {columns.map((c) => (
                          <th
                            key={c.key}
                            scope="col"
                            className={cn(
                              'whitespace-nowrap px-4 py-3 font-semibold',
                              c.width ?? '',
                            )}
                          >
                            {c.label}
                          </th>
                        ))}
                        {actions ? (
                          <th
                            scope="col"
                            className="whitespace-nowrap px-4 py-3 text-right font-semibold"
                          >
                            <span className="sr-only">Actions</span>
                          </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((item) => {
                        /*
                          Why the unwrap: renderItem is documented
                          to return either a Fragment with N
                          children, an array of N elements, or a
                          single Fragment wrapping the N cells.
                          `React.Children.toArray` does NOT
                          descend into a Fragment's
                          `props.children` — it treats the
                          Fragment itself as one child. Without
                          the unwrap, every renderItem collapses
                          into a single cell and the row's
                          structure becomes (data, actions)
                          instead of (col0, col1, …, actions).

                          The unwrap is local: it accepts the raw
                          return value of renderItem, checks
                          whether it is a single React.Fragment
                          (or a single-element array whose only
                          element is a Fragment), and, if so,
                          treats the Fragment's children as the
                          cell list. This keeps the caller-
                          facing contract simple (return one
                          Fragment, one cell per child) without
                          changing the cell-by-cell mapping
                          below.
                        */
                        const rawChildren = renderItem(item);
                        const fragmentChildren = unwrapToCellList(rawChildren);
                        return (
                          <tr
                            key={getKey(item)}
                            className={cn(
                              'border-b last:border-b-0',
                              interactiveActions ? 'transition-colors hover:bg-muted/40' : '',
                            )}
                          >
                            {/*
                              The body cells use the same width
                              classes as the header so each column
                              is the same width on every row. The
                              `align-top` keeps the action column
                              anchored to the top of the row so
                              long titles don't push the actions
                              down.
                            */}
                            {fragmentChildren.map((child, idx) => {
                              if (!React.isValidElement(child)) return null;
                              const col = columns[idx];
                              return (
                                <td
                                  key={col?.key ?? idx}
                                  className={cn(
                                    'align-top px-4 py-3 [&>*]:min-w-0',
                                    col?.width ?? '',
                                  )}
                                >
                                  {child}
                                </td>
                              );
                            })}
                            {actions ? (
                              <td className="align-top px-4 py-3 text-right">
                                <div className="flex shrink-0 items-center justify-end gap-2">
                                  {actions(item)}
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/*
                    Mobile stacked view: one card per row, with
                    the column label on the left and the value
                    on the right. The actions row is full-width
                    at the bottom so it's easy to tap.
                  */}
                  <ul role="list" className="flex flex-col gap-3 p-3 sm:hidden">
                    {rows.map((item) => {
                      const cells = unwrapToCellList(renderItem(item));
                      return (
                        <li
                          key={getKey(item)}
                          className="rounded-md border bg-card p-3 text-sm"
                        >
                          <dl className="flex flex-col gap-1.5">
                            {keys.map((k, idx) => (
                              <div
                                key={k.key}
                                className="flex items-baseline justify-between gap-2"
                              >
                                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  {k.label}
                                </dt>
                                <dd className="text-right">{cells[idx]}</dd>
                              </div>
                            ))}
                          </dl>
                          {actions ? (
                            <div className="mt-3 flex items-center justify-end gap-2 border-t pt-3">
                              {actions(item)}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}
        </AdminDataState>
      </Container>
    </Section>
  );
}

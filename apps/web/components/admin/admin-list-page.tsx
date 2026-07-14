import * as React from 'react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';

// Shared list-page chrome for the admin console. The 7
// catalog/finance/student pages (programs/grades/courses/
// chapters/sessions/payments/students) all share the same
// layout: a header (title + subline) above a card grid.
// Renders an empty state when `items` is empty.
//
// The grid is intentionally card-based (not a Table primitive)
// — see plan §2.2: "A `Table` / `DataTable` UI primitive is
// out of scope; card-grid is sufficient for the v2 list
// sizes". If `students` or `payments` exceed ~30 rows we
// can revisit.

interface AdminListPageProps<T> {
  title: string;
  subline: string;
  empty: string;
  emptyIcon: React.ReactNode;
  items: ReadonlyArray<T>;
  renderItem: (item: T) => React.ReactNode;
  getKey: (item: T) => string;
  columns?: ReadonlyArray<{
    key: string;
    label: string;
    // Optional Tailwind classes applied to the <li> wrapper
    // (e.g. "sm:col-span-2").
    className?: string;
  }>;
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
}: AdminListPageProps<T>) {
  return (
    <Section spacing="default" aria-labelledby="admin-list-title">
      <Container>
        <header className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Heading id="admin-list-title" level="h1" className="text-3xl sm:text-4xl">
              {title}
            </Heading>
            <Badge variant="outline" className="text-xs">
              {items.length}
            </Badge>
          </div>
          <p className="mt-2 text-base text-muted-foreground">{subline}</p>
        </header>

        {items.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={emptyIcon}
              title={empty}
              description=""
            />
          </div>
        ) : (
          <Card>
            <CardHeader>
              {columns ? (
                <div
                  role="row"
                  className={cn(
                    'hidden gap-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid',
                    gridColsClass(columns),
                  )}
                >
                  {columns.map((c) => (
                    <span key={c.key}>{c.label}</span>
                  ))}
                </div>
              ) : (
                <CardTitle className="text-base">{title}</CardTitle>
              )}
            </CardHeader>
            <CardContent>
              <ul role="list" className="flex flex-col gap-2">
                {items.map((item) => (
                  <li
                    key={getKey(item)}
                    className={cn(
                      'rounded-md border bg-card p-3 text-sm transition-colors hover:bg-muted/50',
                      columns ? gridColsClass(columns) : '',
                    )}
                  >
                    {renderItem(item)}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </Container>
    </Section>
  );
}

// Build a Tailwind class string like "sm:grid-cols-5" from
// the column count. Tailwind needs full literal class names
// to keep them in the bundle, so the call site supplies the
// columns array; this helper is a pure formatter.
function gridColsClass(columns: ReadonlyArray<{ key: string; label: string; className?: string }>): string {
  if (!columns || columns.length === 0) return '';
  // Tailwind 3 supports grid-cols-2..12 as static names.
  const n = columns.length;
  return `sm:grid sm:grid-cols-1 sm:gap-3 ${gridColsPrefix(n)}`;
}

// Build the grid-cols-{n} class for the column count.
// Tailwind needs the literal class name in source, so we
// keep a small static map for the counts we use.
function gridColsPrefix(n: number): string {
  switch (n) {
    case 1: return '';
    case 2: return 'sm:grid-cols-2';
    case 3: return 'sm:grid-cols-3';
    case 4: return 'sm:grid-cols-4';
    case 5: return 'sm:grid-cols-5';
    case 6: return 'sm:grid-cols-6';
    case 7: return 'sm:grid-cols-7';
    case 8: return 'sm:grid-cols-8';
    default: return 'sm:grid-cols-4';
  }
}

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { Container } from './container';
import { cn } from '@/lib/utils/cn';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  /** Optional breadcrumb trail. The first item is treated as home. */
  breadcrumbs?: BreadcrumbItem[];
  /** H1 string. The `<h1>` lives inside PageHeader so it appears once per page. */
  title: string;
  /** Optional subtitle / lead paragraph. */
  description?: React.ReactNode;
  /** Optional right-aligned actions (e.g. CTA buttons). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Standard page header. Owns the page `<h1>` and the breadcrumb
 * trail. Used on every marketing and dashboard page so that the
 * page structure is uniform and the outline is always valid.
 */
export function PageHeader({
  breadcrumbs,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('border-b bg-background', className)}>
      <Container className="py-8 sm:py-10 md:py-12">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Fil d'Ariane" className="mb-3 text-sm text-muted-foreground sm:mb-4">
            <ol className="flex flex-wrap items-center gap-1">
              {breadcrumbs.map((b, i) => {
                const isLast = i === breadcrumbs.length - 1;
                return (
                  <li key={`${b.label}-${i}`} className="flex items-center gap-1">
                    {i === 0 && <Home className="h-3.5 w-3.5" aria-hidden="true" />}
                    {b.href && !isLast ? (
                      <Link
                        href={b.href}
                        className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {b.label}
                      </Link>
                    ) : (
                      <span aria-current={isLast ? 'page' : undefined} className="text-foreground">
                        {b.label}
                      </span>
                    )}
                    {!isLast && (
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
              {title}
            </h1>
            {description && (
              <p className="mt-3 max-w-prose text-base text-muted-foreground sm:text-lg">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </Container>
    </header>
  );
}

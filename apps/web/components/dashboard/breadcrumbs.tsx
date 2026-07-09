import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: ReadonlyArray<BreadcrumbItem>;
  className?: string;
}

/**
 * A simple breadcrumb trail. The last item is rendered as plain
 * text (no link) and gets `aria-current="page"`.
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Fil d’Ariane" className={cn('text-xs text-muted-foreground', className)}>
      <ol role="list" className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className="font-medium text-foreground">
                  {item.label}
                </span>
              )}
              {!last && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

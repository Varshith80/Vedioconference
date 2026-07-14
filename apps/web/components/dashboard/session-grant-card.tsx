import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCents } from '@/lib/utils/format';
import type { SessionGrantWithDetails } from '@/types/domain';

interface SessionGrantCardProps {
  grant: SessionGrantWithDetails;
  /** Locale-prefixed path the "View" button points at
   *  (the public session detail page). */
  viewHref: string;
}

/**
 * Dashboard card for a single session grant. Used on
 * `/dashboard/programs` and `/dashboard/sessions`.
 *
 * The card surfaces the session title, chapter, course,
 * and the grant status. The "View" button is a normal link
 * (no destructive action).
 */
export function SessionGrantCard({ grant, viewHref }: SessionGrantCardProps) {
  const statusVariant = variantForStatus(grant.status);
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="line-clamp-2 text-base">
              {grant.session.title}
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-1">
              {grant.course.title}
              {grant.session.chapter?.title ? ` · ${grant.session.chapter.title}` : ''}
            </CardDescription>
          </div>
          <Badge variant={statusVariant} className="shrink-0 text-[10px]">
            {labelForStatus(grant.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="mt-auto flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-foreground">
          {formatCents(grant.amount_cents, grant.currency)}
        </span>
        <Link
          href={viewHref}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View
        </Link>
      </CardContent>
    </Card>
  );
}

function variantForStatus(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (s) {
    case 'active':
    case 'completed':
      return 'default';
    case 'pending_payment':
      return 'secondary';
    case 'cancelled':
    case 'refunded':
      return 'destructive';
    default:
      return 'outline';
  }
}

function labelForStatus(s: string): string {
  switch (s) {
    case 'pending_payment': return 'Pending payment';
    case 'active': return 'Active';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    case 'refunded': return 'Refunded';
    default: return s;
  }
}

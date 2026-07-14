import * as React from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatCents } from '@/lib/utils/format';
import type { Session } from '@/types/domain';

interface SessionCardProps {
  session: Session;
  /** Locale-prefixed path the "View chapter" link points at. */
  chapterHref: string;
  /** Locale-prefixed path the "Buy" button POSTs to. */
  buyHref: string;
}

/**
 * Public session card used on the public session detail page
 * and the chapter detail page. Pure presentational. The "Buy"
 * button is disabled when `session.price_cents` is NULL
 * (Sprint 5 will populate prices from the Excel curriculum).
 */
export function SessionCard({ session, chapterHref, buyHref }: SessionCardProps) {
  const priceKnown = session.price_cents != null;
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {session.title}
            </h2>
            {session.description ? (
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                {session.description}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {session.duration_min ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  {session.duration_min} min
                </span>
              ) : null}
              {session.is_preview ? (
                <Badge variant="outline" className="text-[10px]">Free preview</Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {priceKnown ? (
              <p className="font-heading text-2xl font-bold text-foreground">
                {formatCents(session.price_cents as number, session.currency)}
              </p>
            ) : (
              <Badge variant="outline" className="text-xs">Price TBD</Badge>
            )}
            {priceKnown ? (
              <Button asChild size="lg">
                <Link href={buyHref}>Buy this session</Link>
              </Button>
            ) : (
              <Button size="lg" disabled aria-disabled>
                Price TBD
              </Button>
            )}
            <Link
              href={chapterHref}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ← Back to the chapter
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

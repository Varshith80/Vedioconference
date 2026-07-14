import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCents } from '@/lib/utils/format';
import type { ChapterWithSessions, Session } from '@/types/domain';

interface ChapterListProps {
  chapters: ReadonlyArray<ChapterWithSessions>;
  courseSlug: string;
  /** Locale-prefixed path prefix the chapter link points at
   *  (e.g. `/en/courses/maths-1ere/chapters/`). */
  basePath: string;
}

/**
 * Chapter accordion used on the course detail page. Renders one
 * collapsible per chapter, with each session listed inside.
 * Each session card links to `/[locale]/courses/[slug]/chapters/[chapterSlug]`
 * for the full chapter view AND to `/[locale]/sessions/[id]` for
 * the "buy this session" CTA.
 *
 * Pure presentational. The page owns the open/close state via
 * a small `<details>`/`<summary>` per chapter (no JS needed;
 * works without hydration).
 */
export function ChapterList({ chapters, courseSlug, basePath }: ChapterListProps) {
  if (chapters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This course has no published chapters yet.
      </p>
    );
  }

  return (
    <ul role="list" className="flex flex-col gap-3">
      {chapters.map((chapter) => {
        const totalDuration = chapter.sessions.reduce(
          (acc, s) => acc + (s.duration_min ?? chapter.default_duration_min ?? 0),
          0,
        );
        return (
          <li
            key={chapter.id}
            className="rounded-lg border bg-card shadow-sm"
          >
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Chapter {chapter.position}
                  </p>
                  <h3 className="mt-0.5 font-heading text-base font-semibold text-foreground sm:text-lg">
                    {chapter.title}
                  </h3>
                  {chapter.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {chapter.description}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">
                      {chapter.sessions.length} {chapter.sessions.length === 1 ? 'session' : 'sessions'}
                    </Badge>
                    {totalDuration > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {totalDuration} min
                      </span>
                    ) : null}
                  </div>
                </div>
                <ChevronDown
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>

              <div className="border-t p-4">
                {chapter.sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This chapter has no sessions yet.
                  </p>
                ) : (
                  <ul role="list" className="flex flex-col gap-2">
                    {chapter.sessions.map((s) => (
                      <SessionRow
                        key={s.id}
                        session={s}
                        fallbackDuration={chapter.default_duration_min}
                        buyHref={`${basePath.replace(/\/$/, '')}/${s.id}`}
                        chapterHref={`${basePath}/${chapter.slug}`}
                        courseSlug={courseSlug}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

interface SessionRowProps {
  session: Session;
  fallbackDuration: number;
  buyHref: string;
  chapterHref: string;
  courseSlug: string;
}

/**
 * One session inside a chapter accordion. Renders the title,
 * duration, price, and a "Buy" button. If the price is NULL
 * (Sprint 5 has not imported it yet) the button is disabled
 * and labelled "Price TBD".
 */
function SessionRow({ session, fallbackDuration, buyHref, chapterHref }: SessionRowProps) {
  const dur = session.duration_min ?? fallbackDuration;
  const priceKnown = session.price_cents != null;
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          Session {session.position} · {session.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {dur > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {dur} min
            </span>
          ) : null}
          {priceKnown ? (
            <span className="font-semibold text-foreground">
              {formatCents(session.price_cents as number, session.currency)}
            </span>
          ) : (
            <Badge variant="outline" className="text-[10px]">Price TBD</Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={chapterHref}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View chapter
        </Link>
        {priceKnown ? (
          <Link
            href={buyHref}
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Buy
          </Link>
        ) : (
          <span
            aria-disabled="true"
            title="The price for this session will be available soon."
            className="inline-flex cursor-not-allowed items-center justify-center rounded-md bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground"
          >
            Price TBD
          </span>
        )}
      </div>
    </li>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCents } from '@/lib/utils/format';
import { localizedTitle } from '@/lib/i18n/localized-title';
import type { ChapterWithSessions, Session } from '@/types/domain';

interface ChapterListProps {
  chapters: ReadonlyArray<ChapterWithSessions>;
  /** Locale-prefixed path prefix the chapter link points at
   *  (e.g. `/en/courses/maths-1ere/chapters/`). */
  basePath: string;
}

/**
 * Chapter accordion used on the course detail page. Renders one
 * collapsible per chapter, with each session listed inside.
 *
 * Each session card links to the locale-prefixed session
 * detail page (`/{locale}/sessions/{id}`) for the "Buy this
 * session" CTA. The "View chapter" link points at the
 * chapter detail page (`{basePath}/{chapterSlug}`).
 *
 * Pure presentational. The page owns the open/close state via
 * a small `<details>`/`<summary>` per chapter (no JS needed;
 * works without hydration).
 *
 * NOTE: this component is now a Client Component because it
 * reads the active locale with `useLocale()` so the buy link
 * is always locale-prefixed. It does not manage state.
 */
export function ChapterList({ chapters, basePath }: ChapterListProps) {
  const tChapters = useTranslations('Chapters');
  const tSessions = useTranslations('Sessions');
  const locale = useLocale();

  if (chapters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{tChapters('emptyCourse')}</p>
    );
  }

  return (
    <ul role="list" className="flex flex-col gap-3">
      {chapters.map((chapter) => {
        const totalDuration = chapter.sessions.reduce(
          (acc, s) => acc + (s.duration_min ?? chapter.default_duration_min ?? 0),
          0,
        );
        // The chapter title is read from the row's
        // `metadata.titles[locale]` field when present, with
        // `chapter.title` as the fallback. The importer is
        // the only writer of the metadata field.
        const chapterTitle = localizedTitle(chapter, locale as 'en' | 'fr');
        return (
          <li
            key={chapter.id}
            className="rounded-lg border bg-card shadow-sm"
          >
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {tChapters('position', { n: chapter.position })}
                  </p>
                  <h3 className="mt-0.5 font-heading text-base font-semibold text-foreground sm:text-lg">
                    {chapterTitle}
                  </h3>
                  {chapter.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {chapter.description}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">
                      {tChapters('sessionCount', { count: chapter.sessions.length })}
                    </Badge>
                    {totalDuration > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {tChapters('totalDuration', { minutes: totalDuration })}
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
                    {tChapters('noSessions')}
                  </p>
                ) : (
                  <ul role="list" className="flex flex-col gap-2">
                    {chapter.sessions.map((s) => (
                      <SessionRow
                        key={s.id}
                        session={s}
                        fallbackDuration={chapter.default_duration_min}
                        basePath={basePath}
                        chapterSlug={chapter.slug}
                        tSessions={tSessions}
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
  fallbackDuration: number | null | undefined;
  /** Locale-prefixed base path of the chapter detail page,
   *  e.g. `/en/courses/maths-lycee/chapters`. */
  basePath: string;
  chapterSlug: string;
  // Translator passed down to keep this row simple. The
  // component is rendered from the chapter accordion so the
  // translator is already a `useTranslations('Sessions')`
  // value; passing it down avoids a hook call inside a loop.
  tSessions: ReturnType<typeof useTranslations<'Sessions'>>;
}

/**
 * One session inside a chapter accordion. Renders the title,
 * duration, price, and a "Buy" button. If the price is NULL
 * (Sprint 5 has not imported it yet) the button is disabled
 * and labelled "Price TBD".
 */
function SessionRow({ session, fallbackDuration, basePath, chapterSlug, tSessions }: SessionRowProps) {
  const locale = useLocale();
  const dur = session.duration_min ?? fallbackDuration ?? 0;
  const priceKnown = session.price_cents != null;
  const buyHref = `/${locale}/sessions/${session.id}`;
  const chapterHref = `${basePath.replace(/\/$/, '')}/${chapterSlug}`;
  // Localized session title for the row label. The
  // importer is the only writer of the metadata field.
  const sessionTitle = localizedTitle(session, locale as 'en' | 'fr');
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {tSessions('positionTitle', { n: session.position, title: sessionTitle })}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {dur > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {tSessions('duration', { minutes: dur })}
            </span>
          ) : null}
          {priceKnown ? (
            <span className="font-semibold text-foreground">
              {formatCents(session.price_cents as number, session.currency)}
            </span>
          ) : (
            <Badge variant="outline" className="text-[10px]">{tSessions('priceTbd')}</Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={chapterHref}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {tSessions('viewChapter')}
        </Link>
        {priceKnown ? (
          <Link
            href={buyHref}
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tSessions('buy')}
          </Link>
        ) : (
          <span
            aria-disabled="true"
            title={tSessions('priceTbdHint')}
            className="inline-flex cursor-not-allowed items-center justify-center rounded-md bg-muted px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            {tSessions('priceTbd')}
          </span>
        )}
      </div>
    </li>
  );
}

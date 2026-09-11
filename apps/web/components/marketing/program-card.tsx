import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, GraduationCap, Layers } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import type { Program } from '@/types/domain';

interface ProgramCardProps {
  program: Program;
  /** Number of published courses under this program (for the
   *  "view courses" badge). */
  courseCount?: number;
  /** Optional grade count (only the high-school program has grades). */
  gradeCount?: number;
  /** Optional localized title; falls back to `program.title`. The
   *  parent (e.g. `/levels`) resolves the FR title from
   *  `program.metadata.titles.fr.title` and passes it down so
   *  the runtime app never hardcodes a curriculum name. */
  displayTitle?: string;
  /** Pre-localized count label for the courses line (e.g. "2 courses").
   *  The parent resolves the ICU plural once on the server. */
  coursesLabel?: string;
  /** Pre-localized count label for the grades line. Only rendered
   *  when the program has grades. */
  gradesLabel?: string;
  /** Pre-localized label for the card's primary CTA (e.g. "Explore").
   *  The parent resolves this via the `Levels` i18n namespace so the
   *  card itself never hardcodes a UI string. */
  exploreLabel?: string;
  /** Locale-prefixed path the card links to (e.g. `/en/levels/high-school`). */
  href: string;
  /** Optional className passthrough for layout (e.g. full-bleed width). */
  className?: string;
}

/**
 * Marketing card for an academic program. Used on the `/levels`
 * index and the dashboard "my programs" list. Pure presentational
 * — all i18n and data lookups happen in the parent. The
 * 4 optional props (`displayTitle`, `coursesLabel`, `gradesLabel`,
 * `exploreLabel`) cover the same surface as the deep-link page's
 * `<CourseCard displayTitle={...} />` pattern.
 *
 * Accessibility: the visible CTA is a real `<Button asChild><Link>`
 * so screen readers announce an actionable button. A second
 * `sr-only` `<Link>` makes the whole card reachable for
 * keyboard users who tab to it.
 */
export function ProgramCard({
  program,
  courseCount,
  gradeCount,
  href,
  displayTitle,
  coursesLabel,
  gradesLabel,
  exploreLabel,
  className,
}: ProgramCardProps) {
  const ariaTitle = displayTitle ?? program.title;
  // `exploreLabel` is required and is always passed by the parent
  // (resolved via the `Levels` i18n namespace). We render an empty
  // string if a caller forgets to pass it; the page is the only
  // current caller and always threads the i18n key through.
  const ctaLabel = exploreLabel ?? '';
  const showCourses = typeof courseCount === 'number' && Boolean(coursesLabel);
  const showGrades = typeof gradeCount === 'number' && gradeCount > 0 && Boolean(gradesLabel);

  return (
    <Card
      className={cn(
        'group relative flex h-full flex-col overflow-hidden border border-border/70 bg-card',
        'shadow-sm transition-all duration-200 ease-out',
        'hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg',
        'focus-within:-translate-y-1 focus-within:border-primary/40 focus-within:shadow-lg',
        className,
      )}
    >
      <CardHeader className="space-y-3 p-7 pb-4">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
              'bg-primary/10 text-primary ring-1 ring-inset ring-primary/15',
              'transition-colors duration-200 group-hover:bg-primary/15 group-hover:ring-primary/25',
            )}
          >
            <GraduationCap className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="font-heading text-xl font-semibold leading-tight tracking-tight text-balance">
              {ariaTitle}
            </CardTitle>
            {program.subtitle ? (
              <CardDescription className="mt-1.5 text-sm leading-relaxed">
                {program.subtitle}
              </CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-5 px-7 pb-2 pt-0">
        {program.description ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {program.description}
          </p>
        ) : null}

        {(showCourses || showGrades) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {showCourses ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full',
                  'bg-muted/70 px-2.5 py-1 font-medium text-foreground/80 ring-1 ring-inset ring-border/60',
                )}
              >
                <BookOpen className="h-3.5 w-3.5 text-primary/70" aria-hidden="true" />
                {coursesLabel}
              </span>
            ) : null}
            {showGrades ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full',
                  'bg-muted/70 px-2.5 py-1 font-medium text-foreground/80 ring-1 ring-inset ring-border/60',
                )}
              >
                <Layers className="h-3.5 w-3.5 text-primary/70" aria-hidden="true" />
                {gradesLabel}
              </span>
            ) : null}
          </div>
        )}
      </CardContent>

      <div className="mt-2 flex items-center justify-between border-t border-border/60 bg-muted/20 px-7 py-4">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {ariaTitle}
        </span>
        <Button
          asChild
          size="sm"
          className={cn(
            'h-9 gap-1.5 rounded-full px-4 font-medium',
            'shadow-sm transition-all duration-200',
            'group-hover:gap-2.5',
          )}
        >
          <Link
            href={href}
            aria-label={`${ctaLabel} ${ariaTitle}`}
          >
            {ctaLabel}
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </Button>
      </div>

      {/* sr-only link — makes the entire card reachable for keyboard
          users who tab to the card (the visual focus ring is painted
          by `focus-within:` on the Card root). */}
      <Link
        href={href}
        className="sr-only focus:not-sr-only focus:absolute focus:left-1/2 focus:top-1/2 focus:-translate-x-1/2 focus:-translate-y-1/2 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-xs focus:font-medium focus:text-primary-foreground"
        aria-label={`${ctaLabel} ${ariaTitle}`}
        tabIndex={-1}
      >
        {ctaLabel}
      </Link>
    </Card>
  );
}

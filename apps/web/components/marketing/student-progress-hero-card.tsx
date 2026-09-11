import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, LineChart } from 'lucide-react';
import { ProgressBar } from '@/components/dashboard/progress-bar';
import { Button } from '@/components/ui/button';
import type { StudentProgressSummary } from '@/services/student/progress';

// =====================================================================
// Sprint — Homepage Student Progress hero card.
//
// Pure presentational Server Component. Receives the full
// `StudentProgressSummary` (already RLS-scoped by
// `services/student/progress.ts`) and a localised `copy`
// object, and branches on the 5 product states:
//
//   1. summary.hasAny === false        → "Start your learning journey"
//   2. completed === 0                 → "Not started yet"  (0%)
//   3. completed === purchased         → "Completed"        (100%)
//   4. 0 < completed < purchased       → live percent + counts
//   5. (visitor path is handled by the
//       parent — `Hero` only mounts this
//       card when the user is authed)
//
// The percentage is recomputed locally from the same totals
// the service computed, with the same `0..100` clamp, so the
// number on the right of the bar is *always* the live
// `completed / purchased` ratio and never a hard-coded or
// randomly-generated value.
//
// No client directive at the top of this file: the card does
// not use any client-only API, does not own any state, and
// does not register any event handlers. It is a plain RSC
// that can render under either tree.
// =====================================================================

export interface StudentProgressHeroCardCopy {
  title: string;
  subline: string;
  notStarted: string;
  completed: string;
  /** "{percent}%" — caller passes the integer percent. */
  percent: (percent: number) => string;
  /** "{count} sessions purchased" */
  purchased: (count: number) => string;
  /** "{count} scheduled" */
  booked: (count: number) => string;
  /** "{count} completed" */
  completedCount: (count: number) => string;
  ctaNoEnrollment: {
    title: string;
    subline: string;
    cta: string;
  };
}

interface StudentProgressHeroCardProps {
  locale: string;
  summary: StudentProgressSummary;
  copy: StudentProgressHeroCardCopy;
}

function clampPercent(purchased: number, completed: number): number {
  if (purchased <= 0) return 0;
  const ratio = (100 * completed) / purchased;
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}

export function StudentProgressHeroCard({
  locale,
  summary,
  copy,
}: StudentProgressHeroCardProps) {
  // State 5 — no enrollment yet. Renders before any
  // totals-based branch so a student with `hasAny === false`
  // never sees a 0% bar.
  if (!summary.hasAny) {
    return (
      <div
        className="flex flex-col gap-2.5 p-3 sm:p-4"
        data-progress-state="no-enrollment"
      >
        <div className="flex items-center gap-2">
          <LineChart
            className="h-4 w-4 text-[color:var(--brand-accent)]"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-foreground">
            {copy.ctaNoEnrollment.title}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {copy.ctaNoEnrollment.subline}
        </p>
        <Button asChild size="sm" className="mt-1 w-fit">
          <Link
            href={`/${locale}/courses`}
            data-testid="hero-progress-cta"
          >
            {copy.ctaNoEnrollment.cta}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  }

  const { purchased, booked, completed } = summary.totals;
  const percent = clampPercent(purchased, completed);
  const scheduled = Math.max(0, booked - completed);
  const isCompleted = percent === 100;
  const isNotStarted = percent === 0;
  const stateAttr = isCompleted
    ? 'completed'
    : isNotStarted
    ? 'not-started'
    : 'in-progress';

  return (
    <div
      className="flex flex-col gap-2.5 p-3 sm:p-4"
      data-progress-state={stateAttr}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          id="hero-progress-label"
          className="text-sm font-semibold text-foreground"
        >
          {copy.title}
        </p>
        <p
          className="font-mono text-sm tabular-nums text-foreground"
          data-testid="hero-progress-percent"
        >
          {copy.percent(percent)}
        </p>
      </div>
      <ProgressBar
        value={percent}
        label={`${copy.title} — ${copy.percent(percent)}`}
        className="h-2"
      />
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {isNotStarted || isCompleted ? (
          <span className="inline-flex items-center gap-1.5">
            {isCompleted ? (
              <CheckCircle2
                className="h-3.5 w-3.5 text-[color:var(--brand-accent)]"
                aria-hidden="true"
              />
            ) : null}
            {isCompleted ? copy.completed : copy.notStarted}
          </span>
        ) : (
          <span>
            {copy.completedCount(completed)} · {copy.booked(scheduled)}
          </span>
        )}
        <span>{copy.purchased(purchased)}</span>
      </div>
      <p className="text-[11px] text-muted-foreground/80">{copy.subline}</p>
    </div>
  );
}

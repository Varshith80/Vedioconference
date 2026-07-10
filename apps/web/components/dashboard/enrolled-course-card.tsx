'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarRange, CircleCheck, Lock, type LucideIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { Route } from 'next';

/**
 * `components/dashboard/enrolled-course-card.tsx` — presentational
 * card for a single module of an enrolled course. Shows the
 * module's position, title, description, duration, and the
 * current progress state. The "Book" button is rendered for
 * unlocked modules; locked modules show a "Locked" badge with
 * a one-line reason.
 *
 * Status mapping
 * --------------
 *   not_started  → dashed circle, "Book" CTA
 *   in_progress  → filled circle, "Book" CTA (re-booking a
 *                  different slot is allowed)
 *   completed    → check circle, "Booked" badge, the "Book" CTA
 *                  is hidden (the module is finished)
 */
export interface EnrolledCourseCardProps {
  module: {
    id:              string;
    position:        number;
    slug:            string;
    title:           string;
    description:     string | null;
    duration_min:    number;
    is_preview:      boolean;
    is_published:    boolean;
    calendly_event_uri: string | null;
  };
  status:    'not_started' | 'in_progress' | 'completed';
  icon:      LucideIcon;
  locked:    boolean;
  lockReason?: string;
  locale:    'en' | 'fr';
  courseId:  string;
}

export function EnrolledCourseCard(props: EnrolledCourseCardProps) {
  const t = useTranslations('Dashboard.module');
  const fmt = useFormatter();

  const bookHref: Route = `/${props.locale}/dashboard/courses/${props.courseId}/modules/${props.module.id}/book` as Route;

  return (
    <article
      className="group flex flex-col gap-4 rounded-lg border bg-card p-6 shadow-sm sm:flex-row sm:items-start sm:gap-6"
      aria-labelledby={`module-${props.module.id}-title`}
    >
      <div className="flex shrink-0 items-center gap-3">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-muted font-mono text-sm font-semibold"
          aria-label={`Module ${props.module.position}`}
        >
          {String(props.module.position).padStart(2, '0')}
        </span>
        <props.icon
          className={`h-5 w-5 ${
            props.status === 'completed'
              ? 'text-emerald-600'
              : props.status === 'in_progress'
                ? 'text-amber-500'
                : 'text-muted-foreground'
          }`}
          aria-hidden={true}
        />
      </div>
      <div className="flex-1">
        <h3 id={`module-${props.module.id}-title`} className="font-heading text-lg font-semibold text-foreground">
          {props.module.title}
        </h3>
        {props.module.description ? (
          <p className="mt-1 text-pretty text-sm text-muted-foreground">{props.module.description}</p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          <CalendarRange className="mr-1 inline h-3.5 w-3.5" aria-hidden={true} />
          {fmt.number(props.module.duration_min, { style: 'unit', unit: 'minute', unitDisplay: 'short' })}
          {' · '}
          {t(`status.${props.status}`)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
        {props.locked ? (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900"
            title={props.lockReason ?? 'locked'}
          >
            <Lock className="h-3.5 w-3.5" aria-hidden={true} />
            {t('locked')}
          </span>
        ) : props.status === 'completed' ? (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
          >
            <CircleCheck className="h-3.5 w-3.5" aria-hidden={true} />
            {t('completed')}
          </span>
        ) : (
          <Link
            href={bookHref}
            className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('book')}
            <ArrowRight className="h-4 w-4" aria-hidden={true} />
          </Link>
        )}
      </div>
    </article>
  );
}

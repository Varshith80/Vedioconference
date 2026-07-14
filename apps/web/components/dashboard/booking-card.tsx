import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarRange, CircleCheck, ExternalLink, Video } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { Route } from 'next';
import { cn } from '@/lib/utils/cn';
import type { ModuleBooking, ModuleBookingWithDetails } from '@/types/domain';

/**
 * `components/dashboard/booking-card.tsx` — presentational card
 * for a single module booking on the student's "my bookings" page.
 *
 * Renders the module's position + title, the scheduled date /
 * duration, the current booking status (as a coloured badge), and
 * the right CTA: "Join the session" if a Zoom link is available,
 * "Book again" otherwise.
 */
export interface BookingCardProps {
  booking: ModuleBookingWithDetails;
  locale: 'en' | 'fr';
  courseId: string;
}

const STATUS_BADGE: Record<ModuleBooking['status'], string> = {
  pending_payment: 'border-amber-300 bg-amber-50 text-amber-900',
  scheduled:       'border-sky-300 bg-sky-50 text-sky-900',
  confirmed:       'border-emerald-300 bg-emerald-50 text-emerald-900',
  completed:       'border-emerald-300 bg-emerald-50 text-emerald-900',
  cancelled:       'border-rose-300 bg-rose-50 text-rose-900',
  no_show:         'border-zinc-300 bg-zinc-100 text-zinc-900',
  rescheduled:     'border-amber-300 bg-amber-50 text-amber-900',
};

export function BookingCard({ booking, locale, courseId }: BookingCardProps) {
  const t = useTranslations('Dashboard.bookings');
  const fmt = useFormatter();

  const moduleData = booking.module;
  const joinHref = booking.meeting?.join_url ?? null;
  const bookHref: Route = `/${locale}/dashboard/courses/${courseId}/modules/${booking.module_id}/book` as Route;

  const dateLabel = booking.scheduled_start
    ? fmt.dateTime(new Date(booking.scheduled_start), {
        dateStyle: 'long',
        timeStyle: 'short',
      })
    : null;

  return (
    <article
      className="group flex flex-col gap-4 rounded-lg border bg-card p-6 shadow-sm sm:flex-row sm:items-start sm:gap-6"
      aria-labelledby={`booking-${booking.id}-title`}
    >
      <div className="flex shrink-0 items-center gap-3">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-muted font-mono text-sm font-semibold"
          aria-label={`${t('moduleLabel')} ${moduleData.position}`}
        >
          {String(moduleData.position).padStart(2, '0')}
        </span>
        <CalendarRange className="h-5 w-5 text-muted-foreground" aria-hidden={true} />
      </div>
      <div className="flex-1">
        <h3 id={`booking-${booking.id}-title`} className="font-heading text-lg font-semibold text-foreground">
          {moduleData.title}
        </h3>
        {dateLabel ? (
          <p className="mt-1 text-pretty text-sm text-muted-foreground">
            {t('scheduled', { date: dateLabel })}
          </p>
        ) : null}
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <CircleCheck className="h-3.5 w-3.5" aria-hidden={true} />
          {t('duration', { minutes: moduleData.duration_min })}
        </p>
        <p className="mt-2">
          <span
            className={cn(
              'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
              STATUS_BADGE[booking.status] ?? 'border-zinc-300 bg-zinc-100 text-zinc-900',
            )}
          >
            {t(`status.${booking.status}`)}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
        {joinHref && (booking.status === 'confirmed' || booking.status === 'scheduled') ? (
          <a
            href={joinHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Video className="h-4 w-4" aria-hidden={true} />
            {t('joinSession')}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden={true} />
          </a>
        ) : (
          <Link
            href={bookHref}
            className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('bookAgain')}
            <ArrowRight className="h-4 w-4" aria-hidden={true} />
          </Link>
        )}
      </div>
    </article>
  );
}

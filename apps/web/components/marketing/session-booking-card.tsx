'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { CalendlyInlineEmbed } from '@/components/dashboard/calendly-inline-embed';
import type { Session } from '@/types/domain';

export interface SessionBookingCardProps {
  /** The session row. The card only renders the embed if the
   *  session has both a tutor and a Calendly event-type URI. */
  session: Session;
  /** Used by the parent translator for the embed-title and
   *  embed-unavailable keys. Must be one of the supported
   *  EmailLocale / i18n locales. */
  locale: 'en' | 'fr';
  /** Optional student context forwarded to Calendly as the
   *  embed's `prefill`. The course-detail RSC is a public
   *  surface (anon visitors) — when the student is anonymous,
   *  no prefill is sent. */
  studentEmail?: string;
  studentName?: string;
}

/**
 * `components/marketing/session-booking-card.tsx` — Phase 3
 * M3.3. One card per published session on the course detail
 * page. Wraps the existing `CalendlyInlineEmbed` (the
 * dashboard component, reused as-is) plus a small header.
 *
 * Fallback: when the session has no tutor or no Calendly
 * event-type URI, render the `embedUnavailable` i18n string
 * instead of an empty widget. This matches the "Booking opens
 * soon" placeholder pattern from Sprint 3.8 §11.
 *
 * Pure presentational. Receives the typed `Session` row
 * from `getCourseWithChapters`. The component is small enough
 * to keep in a single file rather than split into atoms.
 *
 * CSP: the Calendly script (`assets.calendly.com`) and frame
 * (`calendly.com`) origins are already permitted in
 * `next.config.mjs:82-87`. No CSP change is required.
 */
export function SessionBookingCard({
  session,
  locale,
  studentEmail,
  studentName,
}: SessionBookingCardProps) {
  const t = useTranslations('Sessions');

  const hasEmbed = Boolean(session.tutor_id && session.calendly_event_uri);

  if (!hasEmbed) {
    return (
      <div
        role="note"
        className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
      >
        {t('embedUnavailable')}
      </div>
    );
  }

  // Calendly's prefill is optional; build the object only
  // when at least one field is set, to avoid passing
  // `prefill={undefined}` through a deeply-nested JSX tree.
  const prefill =
    studentEmail || studentName
      ? {
          ...(studentName ? { name: studentName } : {}),
          ...(studentEmail ? { email: studentEmail } : {}),
        }
      : undefined;

  return (
    <div className="space-y-3" data-locale={locale}>
      <h3 className="text-base font-semibold text-foreground">
        {t('embedTitle')}
      </h3>
      <CalendlyInlineEmbed
        eventTypeUri={session.calendly_event_uri as string}
        prefill={prefill}
        minHeight={620}
      />
    </div>
  );
}

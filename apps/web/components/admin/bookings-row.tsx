import * as React from 'react';
import { PlayCircle } from 'lucide-react';
import {
  BOOKING_STATUS_COLOR,
  PAYMENT_STATUS_COLOR,
} from '@/components/admin/bookings-filtered-list';
import type {
  BookingStatus,
  PaymentStatus,
  BookingWithDetails,
} from '@/services/admin/bookings';

// =====================================================================
// Sprint 9 — Booking row presenter.
//
// Pure-presentational. Takes the booking object + the localised
// status label maps already passed through to
// `BookingsFilteredList`, and returns the 10 cells the
// table maps to <td>s. Extracted out of the bookings page so
// `BookingsFilteredList` (a Client Component) can render it
// inline without the parent Server Component needing to pass a
// function across the boundary.
//
// Kept here — and not inside `bookings-filtered-list.tsx` — so
// the row layout is one small, focused file that the bookings
// page can also reuse (e.g. on a future detail page) without
// pulling the entire filter chrome in.
//
// Return shape: a flat 10-element array of <span> nodes, in
// column order. The list component maps these into <td>s on
// desktop and into the <dd> values on the mobile stacked view.
// We intentionally do NOT return a Fragment here: `React.Children
// .toArray(<BookingRow ... />)` would collapse a Fragment to a
// single child, which would make the whole row land in one
// <td>. An array of 10 siblings keeps the column count
// identical to the original inline rendering.
//
// No client directive at the top of this file: it has no
// client-only APIs and no event handlers. It is a plain
// presentational component that can render in either tree.
// =====================================================================

export interface BookingRowProps {
  b: BookingWithDetails;
  bookingStatusLabels: Record<BookingStatus, string>;
  paymentStatusLabels: Record<PaymentStatus, string>;
  /**
   * Sprint 11 — 11-E read-path UI. Localised "Watch recording"
   * link text. When the booking's meeting has a `recording_url`,
   * the session cell renders a small pill linking to it. When
   * the URL is missing, the cell renders a muted
   * "Recording not available yet" pill in the same position
   * so the admin always sees a recording state.
   */
  recordingCta?: string;
  /**
   * Localised `aria-label` for the recording pill. Used by
   * screen-readers to describe the link. Falls back to the
   * cta text if omitted.
   */
  recordingAriaLabel?: string;
  /**
   * Localised "Recording not available yet" pending notice.
   * Rendered as a muted pill in the same session cell when
   * `recording_url` is null. The student-side `RecordingLinkCard`
   * has the same copy under `Dashboard.bookings.recording.pending`;
   * on the admin side it lives under `Admin.bookings.recording.pending`.
   */
  recordingPending?: string;
}

// Locale-agnostic YYYY-MM-DD HH:MM (UTC). Avoids any
// toLocaleString hydration mismatch on SSR/CSR. Mirrors the
// helper that used to live next to the bookings page.
function formatDateTime(iso: string): string {
  return iso.slice(0, 10) + ' ' + iso.slice(11, 16);
}

export function BookingRow({
  b,
  bookingStatusLabels,
  paymentStatusLabels,
  recordingCta,
  recordingAriaLabel,
  recordingPending,
}: BookingRowProps): React.ReactNode[] {
  // Defensive read: the typed `BookingWithDetails.meeting.recording_url`
  // is `string | null` after 11-F's local migration apply + `pnpm
  // db:types` regen. The `.trim()` defence collapses a whitespace
  // string to "no URL" so a future malformed payload does not
  // produce a `<a href="   ">` the browser cannot navigate.
  const recordingUrl =
    typeof b.meeting?.recording_url === 'string'
      ? b.meeting.recording_url.trim()
      : '';
  const hasRecording = recordingUrl.length > 0;
  return [
    <span key="id" className="font-mono text-xs text-muted-foreground">
      {b.id.slice(0, 8)}
    </span>,
    <span key="student" className="flex flex-col text-xs">
      <span className="font-medium text-foreground">
        {b.student?.full_name ?? '—'}
      </span>
      <span className="text-muted-foreground">{b.student?.email ?? ''}</span>
    </span>,
    <span key="program" className="text-xs text-foreground">
      {b.curriculum?.program_title ?? '—'}
    </span>,
    <span key="course" className="text-xs text-foreground">
      {b.curriculum?.course_title ?? '—'}
    </span>,
    <span key="chapter" className="text-xs text-foreground">
      {b.curriculum?.chapter_title ?? '—'}
    </span>,
    <span key="session" className="text-xs text-foreground">
      <span className="block">{b.curriculum?.session_title ?? '—'}</span>
      {hasRecording ? (
        <a
          href={recordingUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="admin-recording-link"
          data-recording-state="available"
          aria-label={recordingAriaLabel ?? recordingCta ?? 'Recording'}
          className="mt-1 inline-flex items-center gap-1 rounded-full border border-transparent bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlayCircle
            className="h-3 w-3 text-[color:var(--brand-accent)]"
            aria-hidden="true"
          />
          {recordingCta ?? 'Recording'}
        </a>
      ) : (
        /*
          Sprint 11 — 11-E fix-up. Mirror the student-side
          `RecordingLinkCard` pending state: when no URL has
          landed yet, render a muted "Recording not available
          yet" pill in the same position so the admin always
          sees a recording state. After 11-F's local migration
          apply, the pending pill stays correct for sessions
          that are too recent to have a recording.
        */
        <span
          data-testid="admin-recording-pending"
          data-recording-state="pending"
          aria-label={recordingAriaLabel ?? recordingPending ?? 'Recording'}
          className="mt-1 inline-flex items-center gap-1 rounded-full border border-muted bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          {recordingPending ?? 'Recording not available yet'}
        </span>
      )}
    </span>,
    <span key="tutor" className="text-xs text-foreground">
      {b.tutor?.full_name ?? '—'}
    </span>,
    <span key="when" className="font-mono text-xs tabular-nums text-foreground">
      {formatDateTime(b.scheduled_start)}
    </span>,
    <span key="status">
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs ${
          BOOKING_STATUS_COLOR[b.status] ??
          'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
        }`}
      >
        {bookingStatusLabels[b.status] ?? b.status}
      </span>
    </span>,
    <span key="payment">
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs ${
          b.payment
            ? PAYMENT_STATUS_COLOR[b.payment.status] ??
              'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
            : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
        }`}
      >
        {b.payment ? (paymentStatusLabels[b.payment.status] ?? b.payment.status) : '—'}
      </span>
    </span>,
  ];
}

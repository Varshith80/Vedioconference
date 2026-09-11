import * as React from 'react';
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
}: BookingRowProps): React.ReactNode[] {
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
      {b.curriculum?.session_title ?? '—'}
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

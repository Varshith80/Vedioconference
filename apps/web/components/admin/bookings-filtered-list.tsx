'use client';

import * as React from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import type {
  BookingWithDetails,
  BookingStatus,
  PaymentStatus,
} from '@/services/admin/bookings';

// =====================================================================
// Client-side filter chrome for the admin Bookings list.
//
// We fetch every booking on the server (single joined query) and
// let the client narrow them down with search + status / payment /
// program / tutor / date filters. This keeps the URL stable (no
// query-string handshake on every keystroke) and the page RSC-friendly.
// =====================================================================

export interface BookingsFilterLabels {
  search: string;
  searchPlaceholder: string;
  all: string;
  program: string;
  tutor: string;
  bookingStatus: string;
  paymentStatus: string;
  date: string;
  reset: string;
  results: string;
  empty: string;
}

interface BookingsFilterProps {
  bookings: ReadonlyArray<BookingWithDetails>;
  locale: string;
  basePath: string;
  // Program / tutor lists are derived server-side and passed in so
  // the dropdowns are stable across re-renders.
  programs: ReadonlyArray<{ id: string; title: string }>;
  tutors: ReadonlyArray<{ id: string; full_name: string | null }>;
  labels: BookingsFilterLabels;
  // Localized status enums — the enum values are stable across
  // locales; the *displayed* label is read from the i18n table.
  bookingStatusEnum: ReadonlyArray<BookingStatus>;
  paymentStatusEnum: ReadonlyArray<PaymentStatus>;
  // Pre-resolved status label maps (enum value -> localized string).
  bookingStatusLabels: Record<BookingStatus, string>;
  paymentStatusLabels: Record<PaymentStatus, string>;
  renderRow: (b: BookingWithDetails) => React.ReactNode;
  // Columns config used by the parent AdminListPage chrome.
  columns: ReadonlyArray<{ key: string; label: string; className?: string }>;
}

const BOOKING_STATUSES: ReadonlyArray<BookingStatus> = [
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
];

const PAYMENT_STATUSES: ReadonlyArray<PaymentStatus> = [
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
];

export function BookingsFilteredList({
  bookings,
  locale,
  basePath,
  programs,
  tutors,
  labels,
  bookingStatusEnum,
  paymentStatusEnum,
  bookingStatusLabels,
  paymentStatusLabels,
  renderRow,
  columns,
}: BookingsFilterProps) {
  // Local filter state.
  const [query, setQuery] = React.useState('');
  const [programId, setProgramId] = React.useState<string>('all');
  const [tutorId, setTutorId] = React.useState<string>('all');
  const [bookingStatus, setBookingStatus] = React.useState<string>('all');
  const [paymentStatus, setPaymentStatus] = React.useState<string>('all');
  const [date, setDate] = React.useState<string>('');

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings.filter((b) => {
      if (programId !== 'all' && b.curriculum?.program_id !== programId) return false;
      if (tutorId !== 'all' && b.tutor?.id !== tutorId) return false;
      if (bookingStatus !== 'all' && b.status !== bookingStatus) return false;
      if (paymentStatus !== 'all' && (b.payment?.status ?? null) !== paymentStatus) return false;
      if (date && !b.scheduled_start.startsWith(date)) return false;
      if (q) {
        const hay = [
          b.id,
          b.student?.full_name ?? '',
          b.student?.email ?? '',
          b.tutor?.full_name ?? '',
          b.tutor?.email ?? '',
          b.curriculum?.program_title ?? '',
          b.curriculum?.course_title ?? '',
          b.curriculum?.chapter_title ?? '',
          b.curriculum?.session_title ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, query, programId, tutorId, bookingStatus, paymentStatus, date]);

  const bookingStatusOptions = bookingStatusEnum.length > 0 ? bookingStatusEnum : BOOKING_STATUSES;
  const paymentStatusOptions = paymentStatusEnum.length > 0 ? paymentStatusEnum : PAYMENT_STATUSES;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="bookings-search">
            {labels.search}
          </label>
          <Input
            id="bookings-search"
            type="search"
            placeholder={labels.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="bookings-program">
            {labels.program}
          </label>
          <select
            id="bookings-program"
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">{labels.all}</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="bookings-tutor">
            {labels.tutor}
          </label>
          <select
            id="bookings-tutor"
            value={tutorId}
            onChange={(e) => setTutorId(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">{labels.all}</option>
            {tutors.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name ?? t.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="bookings-status">
            {labels.bookingStatus}
          </label>
          <select
            id="bookings-status"
            value={bookingStatus}
            onChange={(e) => setBookingStatus(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">{labels.all}</option>
            {bookingStatusOptions.map((s) => (
              <option key={s} value={s}>
                {bookingStatusLabels[s] ?? s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="bookings-payment">
            {labels.paymentStatus}
          </label>
          <select
            id="bookings-payment"
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">{labels.all}</option>
            {paymentStatusOptions.map((s) => (
              <option key={s} value={s}>
                {paymentStatusLabels[s] ?? s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="bookings-date">
            {labels.date}
          </label>
          <Input
            id="bookings-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {labels.results.replace('{n}', String(filtered.length)).replace('{total}', String(bookings.length))}
        </span>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setProgramId('all');
            setTutorId('all');
            setBookingStatus('all');
            setPaymentStatus('all');
            setDate('');
          }}
          className="rounded-md border bg-card px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {labels.reset}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
          {labels.empty}
        </div>
      ) : (
        <ul role="list" className="flex flex-col gap-2">
          {filtered.map((b) => (
            <li
              key={b.id}
              className={`rounded-md border bg-card p-3 text-sm transition-colors hover:bg-muted/50 sm:grid sm:grid-cols-1 sm:gap-3 ${gridColsClass(columns.length)}`}
            >
              <Link
                href={`/${locale}${basePath}/${b.id}`}
                className="contents focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {renderRow(b)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function gridColsClass(n: number): string {
  switch (n) {
    case 2: return 'sm:grid-cols-2';
    case 3: return 'sm:grid-cols-3';
    case 4: return 'sm:grid-cols-4';
    case 5: return 'sm:grid-cols-5';
    case 6: return 'sm:grid-cols-6';
    case 7: return 'sm:grid-cols-7';
    case 8: return 'sm:grid-cols-8';
    case 9: return 'sm:grid-cols-9';
    case 10: return 'sm:grid-cols-10';
    default: return 'sm:grid-cols-4';
  }
}

// =============================================================
// Status pill colors — used by both list and detail pages.
// (kept here so the list page renders the same chips as the
// detail page without duplicating the colour table.)
// =============================================================

export const BOOKING_STATUS_COLOR: Record<BookingStatus, string> = {
  scheduled:   'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  confirmed:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  completed:  'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  cancelled:  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  no_show:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  rescheduled:'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
};

export const PAYMENT_STATUS_COLOR: Record<PaymentStatus, string> = {
  pending:             'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  succeeded:           'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  failed:              'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  refunded:            'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  partially_refunded:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
};

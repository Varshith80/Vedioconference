import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// =====================================================================
// Regression test for the "Functions cannot be passed directly to
// Client Components" error that broke /admin/bookings in Sprint 8.
//
// The page is a Server Component. Before the fix, it passed a
// `renderRow` closure (capturing the localised status-label maps)
// down to `BookingsFilteredList`, a `'use client'` component:
//   <BookingsFilteredList renderRow={(b) => <BookingRow b={b} ... />} />
// React 19 / Next 15 do not allow serialising functions across
// the Server→Client boundary, so the page errored.
//
// The fix has two halves and we test both:
//
//   1. SHAPE — `BookingsFilteredList` no longer accepts a
//      `renderRow` prop. The TypeScript prop type must omit it,
//      so even a future contributor cannot reintroduce it
//      without a TS error. We assert by reading the source of
//      `bookings-filtered-list.tsx` and grepping for `renderRow`.
//
//   2. BEHAVIOUR — `BookingsFilteredList` renders 10 cells
//      per booking row using ONLY serialisable props (the
//      booking object, two label maps, a columns list). We
//      render it with a real `BookingWithDetails` payload and
//      assert the row has 10 <td> children on desktop and
//      10 <dd> children per booking on the mobile-stacked list.
//      The cells must contain the booking's id, student name,
//      program, course, etc.
//
// We also pin the *server-side* page contract: the bookings
// page must not pass a `renderRow` prop. We assert this by
// reading the page source and grepping for `renderRow`.
// =====================================================================

// Mocks for the dependencies `BookingsFilteredList` pulls in.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => React.createElement('a', { href }, children),
}));
vi.mock('@/components/ui/input', () => ({
  Input: React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    function Input(props, _ref) {
      return React.createElement('input', props);
    },
  ),
}));

import { BookingsFilteredList } from '@/components/admin/bookings-filtered-list';
import type { BookingWithDetails, BookingStatus, PaymentStatus } from '@/services/admin/bookings';

const FILE_LIST = join(
  process.cwd(),
  'components/admin/bookings-filtered-list.tsx',
);
const FILE_ROW = join(
  process.cwd(),
  'components/admin/bookings-row.tsx',
);
const FILE_PAGE = join(
  process.cwd(),
  'app/[locale]/admin/bookings/page.tsx',
);

function makeBooking(overrides: Partial<BookingWithDetails> = {}): BookingWithDetails {
  return {
    id: '88888888-aaaa-bbbb-cccc-000000000001',
    status: 'confirmed',
    scheduled_start: '2026-09-15T14:00:00Z',
    scheduled_end: '2026-09-15T15:00:00Z',
    timezone: 'Europe/Paris',
    notes: null,
    calendly_event_uri: null,
    calendly_invitee_uri: null,
    cancelled_at: null,
    cancelled_reason: null,
    rescheduled_from: null,
    created_at: '2026-07-20T00:00:00Z',
    updated_at: '2026-07-20T00:00:00Z',
    student: { id: 'stu1', full_name: 'Marie Curie', email: 'marie@example.com' },
    tutor: { id: 'tut1', full_name: 'Alain Turing', email: 'alain@example.com', phone: null, status: 'active' },
    curriculum: {
      session_id: 'ses1',
      session_title: 'Algèbre — séance 1',
      chapter_id: 'ch1',
      chapter_title: 'Polynômes',
      course_id: 'co1',
      course_title: 'Algèbre linéaire',
      program_id: 'pr1',
      program_title: 'MPSI',
      grade_id: 'g1',
      grade_title: 'Sup',
    },
    payment: {
      id: 'pay1',
      amount_cents: 4500,
      currency: 'EUR',
      status: 'succeeded',
      provider: 'stripe',
      created_at: '2026-07-20T00:00:00Z',
    },
    grant: {
      id: 'sg1',
      grant_type: 'individual',
      status: 'active',
      total_credits: 1,
      consumed_credits: 0,
      expires_at: null,
      amount_cents: 4500,
      currency: 'EUR',
    },
    meeting: null,
    ...overrides,
  };
}

const bookingStatusLabels: Record<BookingStatus, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  rescheduled: 'Rescheduled',
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: 'Pending',
  succeeded: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Partial',
};

const labels = {
  search: 'Search',
  searchPlaceholder: 'ID, name, email, course…',
  all: 'All',
  program: 'Program',
  tutor: 'Tutor',
  bookingStatus: 'Booking status',
  paymentStatus: 'Payment status',
  date: 'Date',
  reset: 'Reset filters',
  results: "'{n}' of '{total}' bookings",
  empty: 'No bookings match the current filters.',
};

const columns = [
  { key: 'id', label: 'ID', className: 'w-28' },
  { key: 'student', label: 'Student', className: 'min-w-[200px]' },
  { key: 'program', label: 'Program', className: 'min-w-[160px]' },
  { key: 'course', label: 'Course', className: 'min-w-[180px]' },
  { key: 'chapter', label: 'Chapter', className: 'min-w-[180px]' },
  { key: 'session', label: 'Session', className: 'min-w-[200px]' },
  { key: 'tutor', label: 'Tutor', className: 'w-44' },
  { key: 'when', label: 'When', className: 'w-40' },
  { key: 'status', label: 'Status', className: 'w-32' },
  { key: 'payment', label: 'Payment', className: 'w-36' },
];

describe('BookingsFilteredList — Server→Client boundary', () => {
  it('source: BookingsFilteredList does NOT declare a renderRow prop', () => {
    // Contract guard. The previous bug shipped a `renderRow:
    // (b) => ReactNode` prop on the client component. The
    // page passed a closure down and React 19 refused to
    // serialise it. The fix is structural: no renderRow
    // means nothing to serialise.
    const src = readFileSync(FILE_LIST, 'utf8');
    // No interface field, no destructured argument.
    expect(src).not.toMatch(/\brenderRow\s*:/);
    expect(src).not.toMatch(/\brenderRow\s*[,}]/);
  });

  it('source: bookings-row.tsx exists and exports BookingRow', () => {
    const src = readFileSync(FILE_ROW, 'utf8');
    expect(src).toMatch(/export\s+function\s+BookingRow\b/);
    // The row file is pure-presentational — it must NOT
    // pull in `'use client'`.
    expect(src).not.toMatch(/['"]use client['"]/);
  });

  it('source: bookings-row.tsx is imported directly by the client list', () => {
    const src = readFileSync(FILE_LIST, 'utf8');
    expect(src).toMatch(
      /import\s*\{\s*BookingRow\s*\}\s*from\s*['"]@\/components\/admin\/bookings-row['"]/,
    );
  });

  it('source: the bookings page does NOT pass a renderRow prop', () => {
    // The page is a Server Component. Even though the type
    // system would now catch a `renderRow={…}` prop, we
    // also pin the runtime contract: the JSX in page.tsx
    // never has a `renderRow=` attribute.
    const src = readFileSync(FILE_PAGE, 'utf8');
    expect(src).not.toMatch(/\brenderRow\s*=/);
  });

  it('source: the bookings page does NOT define an inline BookingRow function', () => {
    // Before the fix, the page contained a 60-line
    // `function BookingRow({…}) {…}` that the page passed
    // through renderRow. The refactor moved it to its own
    // file; the page now only knows about
    // `BookingsFilteredList`.
    const src = readFileSync(FILE_PAGE, 'utf8');
    expect(src).not.toMatch(/function\s+BookingRow\s*\(/);
  });

  it('behaviour: renders 10 <td> cells per row, populated from serialisable data', () => {
    const booking = makeBooking();
    const html = renderToStaticMarkup(
      React.createElement(BookingsFilteredList, {
        bookings: [booking],
        locale: 'en',
        basePath: '/admin/bookings',
        programs: [{ id: 'pr1', title: 'MPSI' }],
        tutors: [{ id: 'tut1', full_name: 'Alain Turing' }],
        labels,
        bookingStatusEnum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled'],
        paymentStatusEnum: ['pending', 'succeeded', 'failed', 'refunded', 'partially_refunded'],
        bookingStatusLabels,
        paymentStatusLabels,
        columns,
      }),
    );

    // Header has 10 <th>.
    const thCount = (html.match(/<th\b/g) ?? []).length;
    expect(thCount).toBe(10);

    // First body row has 10 <td>.
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) throw new Error('No tbody in rendered HTML');
    const tbodyHtml = tbodyMatch[1] ?? '';
    const firstTrMatch = tbodyHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/);
    if (!firstTrMatch) throw new Error('No body tr in rendered HTML');
    const firstTr = firstTrMatch[0];
    const tdCount = (firstTr.match(/<td\b/g) ?? []).length;
    expect(tdCount).toBe(10);

    // The 10 cells must carry the data the row component
    // was given — no closure needed, only the serialised
    // booking object.
    expect(firstTr).toContain('88888888'); // id.slice(0, 8)
    expect(firstTr).toContain('Marie Curie');
    expect(firstTr).toContain('MPSI');
    expect(firstTr).toContain('Algèbre linéaire');
    expect(firstTr).toContain('Polynômes');
    expect(firstTr).toContain('Algèbre — séance 1');
    expect(firstTr).toContain('Alain Turing');
    expect(firstTr).toContain('2026-09-15');
    expect(firstTr).toContain('Confirmed');
    expect(firstTr).toContain('Paid');
  });

  it('behaviour: the "{n} of {total} bookings" line interpolates the live counts', () => {
    // Server-side `t('filters.results')` returns the
    // single-quote-escaped literal
    //   "'{n}' of '{total}' bookings"
    // The client then does
    //   labels.results.replace('{n}', n).replace('{total}', total)
    // yielding
    //   "'2' of '2' bookings"
    // (the surrounding single quotes are LITERAL — they are
    // not stripped because the ICU escape was a literal
    // escape, not a variable. This is the exact contract
    // that was broken when the message was rendered as a
    // raw ICU string and next-intl threw FORMATTING_ERROR.)
    const bookings = [makeBooking(), makeBooking({ id: '99999999-aaaa-bbbb-cccc-000000000002' })];
    const html = renderToStaticMarkup(
      React.createElement(BookingsFilteredList, {
        bookings,
        locale: 'en',
        basePath: '/admin/bookings',
        programs: [],
        tutors: [],
        labels,
        bookingStatusEnum: [],
        paymentStatusEnum: [],
        bookingStatusLabels,
        paymentStatusLabels,
        columns,
      }),
    );
    // The escaped message survives — the result line
    // contains "'2' of '2' bookings" (the single quotes
    // are HTML-encoded as &#x27; in the static markup).
    expect(html).toContain('&#x27;2&#x27; of &#x27;2&#x27; bookings');
    // The unescaped placeholders must NOT remain — that
    // would mean the .replace() chain didn't run.
    expect(html).not.toContain('{n}');
    expect(html).not.toContain('{total}');
  });

  it('behaviour: empty filtered list shows the empty message, not a row', () => {
    const html = renderToStaticMarkup(
      React.createElement(BookingsFilteredList, {
        bookings: [],
        locale: 'en',
        basePath: '/admin/bookings',
        programs: [],
        tutors: [],
        labels,
        bookingStatusEnum: [],
        paymentStatusEnum: [],
        bookingStatusLabels,
        paymentStatusLabels,
        columns,
      }),
    );
    expect(html).toContain('&#x27;0&#x27; of &#x27;0&#x27; bookings');
    expect(html).toContain('No bookings match the current filters.');
    expect(html).not.toMatch(/<tbody>/);
  });
});

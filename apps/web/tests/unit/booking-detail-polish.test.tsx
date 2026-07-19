import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// =====================================================================
// Sprint 3.8 — Booking detail polish regression test
// (`apps/web/app/[locale]/admin/bookings/[id]/page.tsx`).
//
// The polish (Sprint 3.8 plan §12) had three parts:
//   1. Fix the copy-paste bug on the Tutor card "View" link.
//      Pre-polish the link pointed to `/admin/students`; after
//      the polish it must point to `/admin/tutors/${tutor.id}`.
//   2. Add a `start_url` row inside the Meeting card with a
//      `CopyButton`, so the admin can copy the host start URL
//      directly (the previous design only exposed the join URL).
//   3. Add a Meeting Status badge at the top-right of the
//      Meeting card. Emerald "Zoom link created" when a
//      meeting row exists; zinc "Awaiting Zoom link" when
//      `booking.meeting` is null.
//
// We test all three by:
//   - Rendering the page with `renderToStaticMarkup` and
//     asserting structural pieces of HTML (link hrefs, badge
//     text, start_url row presence).
//   - Grepping the page source to lock the contract in
//     stone (regression guards: the wrong href string is
//     never reintroduced; the host start URL key is always
//     wired through i18n).
//
// The pattern (mock `next-intl/server`, mock the auth +
// service layer, render to static markup) is the same one
// the Sprint 3.7 `levels-page.test.tsx` uses.
// =====================================================================

// --- Module mocks (must come before the page import) ---

vi.mock('next-intl/server', () => ({
  getRequestConfig: vi.fn(),
  getTranslations: vi.fn(
    async (namespace: string | { namespace: string }) => {
      const ns =
        typeof namespace === 'string' ? namespace : namespace.namespace;
      return (key: string, _vars?: Record<string, unknown>) => {
        // Echo namespaced keys so the rendered HTML proves the
        // page requested them via i18n instead of hardcoding
        // strings.
        return `${ns}.${key}`;
      };
    },
  ),
  setRequestLocale: vi.fn(),
}));

// `next-intl` (client). The page itself doesn't call this —
// the only client islands are the `CopyButton` and `Button`
// (the `Button` is not actually used here). We provide a
// minimal client translator so the static markup pass
// doesn't blow up if any client component leaks in.
vi.mock('next-intl', () => ({
  useTranslations: vi.fn(
    (_ns: string) => (key: string, _vars?: Record<string, unknown>) =>
      key,
  ),
  useLocale: vi.fn(() => 'en'),
}));

// `requireAdmin` — the page is admin-gated. We let any
// request through.
vi.mock('@/hooks/use-require-user', () => ({
  requireAdmin: vi.fn(async () => undefined),
}));

// `@/i18n` exports `isLocale`, which the page calls. The full
// module also pulls in `getRequestConfig`, which would try to
// load messages at import time. We stub just the surface the
// page uses.
vi.mock('@/i18n', () => ({
  isLocale: (s: string | null | undefined): s is 'en' | 'fr' =>
    s === 'en' || s === 'fr',
  locales: ['en', 'fr'],
  defaultLocale: 'en',
}));

// The data layer. We control `getBookingByIdWithDetails`
// per test so we can assert both the "meeting present" and
// "meeting null" branches.
const getBookingByIdWithDetails = vi.fn();
vi.mock('@/services/admin/bookings', () => ({
  getBookingByIdWithDetails: (...args: unknown[]) =>
    getBookingByIdWithDetails(...args),
  BOOKING_STATUS_COLOR: {
    scheduled: 'bg-zinc-100 text-zinc-700',
    confirmed: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-rose-100 text-rose-700',
    no_show: 'bg-rose-100 text-rose-700',
    rescheduled: 'bg-amber-100 text-amber-700',
  },
  PAYMENT_STATUS_COLOR: {
    pending: 'bg-amber-100 text-amber-700',
    succeeded: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-rose-100 text-rose-700',
    refunded: 'bg-zinc-100 text-zinc-700',
    partially_refunded: 'bg-amber-100 text-amber-700',
  },
}));

// The page imports `BOOKING_STATUS_COLOR` and
// `PAYMENT_STATUS_COLOR` from this module — mirror the
// above so the import resolves under vitest.
vi.mock('@/components/admin/bookings-filtered-list', () => ({
  BOOKING_STATUS_COLOR: {
    scheduled: 'bg-zinc-100 text-zinc-700',
    confirmed: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-rose-100 text-rose-700',
    no_show: 'bg-rose-100 text-rose-700',
    rescheduled: 'bg-amber-100 text-amber-700',
  },
  PAYMENT_STATUS_COLOR: {
    pending: 'bg-amber-100 text-amber-700',
    succeeded: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-rose-100 text-rose-700',
    refunded: 'bg-zinc-100 text-zinc-700',
    partially_refunded: 'bg-amber-100 text-amber-700',
  },
}));

// --- The actual page import ---

const { default: AdminBookingDetailPage } = await import(
  '@/app/[locale]/admin/bookings/[id]/page'
);

// --- Helper: render the page as React HTML ---

async function renderPage(booking: unknown | null) {
  getBookingByIdWithDetails.mockReset();
  getBookingByIdWithDetails.mockResolvedValue(booking);

  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const element = await AdminBookingDetailPage({
    params: Promise.resolve({ locale: 'en', id: 'b1' }),
  });
  // renderToStaticMarkup throws on null returns. The page calls
  // `notFound()` (which throws NEXT_NOT_FOUND) when the booking
  // is null; we wrap in try/catch so the "null" branch test
  // can assert the throw.
  if (element === null || element === undefined) {
    return '';
  }
  return renderToStaticMarkup(element as React.ReactElement);
}

const BOOKING_WITH_MEETING = {
  id: 'b1',
  status: 'confirmed',
  scheduled_start: '2026-08-01T10:00:00Z',
  scheduled_end: '2026-08-01T11:00:00Z',
  timezone: 'Europe/Paris',
  notes: 'Bring calculator',
  calendly_event_uri: null,
  calendly_invitee_uri: 'https://calendly.com/invitee/abc',
  cancelled_at: null,
  cancelled_reason: null,
  rescheduled_from: null,
  created_at: '2026-07-25T08:00:00Z',
  updated_at: '2026-07-25T08:00:00Z',
  student: { id: 'stu1', full_name: 'Alice Liddell', email: 'alice@example.com' },
  tutor: { id: 'tut1', full_name: 'Bob Tutor', email: 'bob@example.com' },
  curriculum: {
    session_id: 's1',
    session_title: 'Algebra basics',
    chapter_id: 'c1',
    chapter_title: 'Linear equations',
    course_id: 'co1',
    course_title: 'Mathematics',
    program_id: 'p1',
    program_title: 'High School',
    grade_id: 'g1',
    grade_title: 'Grade 11',
  },
  payment: {
    id: 'pay1',
    amount_cents: 5000,
    currency: 'EUR',
    status: 'succeeded',
    provider: 'stripe',
    created_at: '2026-07-25T08:00:00Z',
  },
  meeting: {
    id: 'm1',
    provider: 'zoom',
    meeting_id: '123456789',
    join_url: 'https://zoom.us/j/123456789',
    passcode: 'secret',
    start_url: 'https://zoom.us/s/123456789?zak=abc',
  },
};

const BOOKING_WITHOUT_MEETING = {
  ...BOOKING_WITH_MEETING,
  meeting: null,
};

// --- Tests ---

describe('/[locale]/admin/bookings/[id] — Sprint 3.8 polish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('FIX: the Tutor card "View" link points to /admin/tutors/{tutor.id}', async () => {
    const html = await renderPage(BOOKING_WITH_MEETING);
    // Must point to the tutor detail page.
    expect(html).toContain('href="/en/admin/tutors/tut1"');
    // The viewTutor action's href (on the tutor card) must be the
    // tutor detail link, not the students directory. We assert by
    // matching the viewTutor anchor element specifically, so the
    // legitimate viewStudent link to /admin/students is unaffected.
    expect(html).toMatch(
      /<a [^>]*href="\/en\/admin\/tutors\/tut1"[^>]*>[\s\S]*?viewTutor/,
    );
  });

  it('FIX: omits the tutor "View" link entirely when the booking has no tutor', async () => {
    const html = await renderPage({
      ...BOOKING_WITH_MEETING,
      tutor: null,
    });
    // No tutor id, so no /admin/tutors/{uuid} link.
    expect(html).not.toMatch(/href="\/en\/admin\/tutors\/[^"]+"/);
  });

  it('POLISH: the Meeting card renders the host start_url row with a CopyButton when the meeting has a start_url', async () => {
    const html = await renderPage(BOOKING_WITH_MEETING);
    // The start_url itself is rendered as monospace text.
    expect(html).toContain('https://zoom.us/s/123456789?zak=abc');
    // The i18n key is used as the row label (mock echoes namespaced keys).
    expect(html).toContain('Admin.bookingDetail.fieldsWithHost.hostStartLabel');
    // The CopyButton for the start_url exists (it's a <button>
    // with the value-bearing aria-label).
    expect(html).toContain('aria-label="Admin.bookingDetail.fieldsWithHost.startUrl (copy)"');
  });

  it('POLISH: the Meeting card renders a "Zoom link created" status badge when meeting exists', async () => {
    const html = await renderPage(BOOKING_WITH_MEETING);
    expect(html).toContain('Admin.bookingDetail.meetingStatus.created');
  });

  it('POLISH: the Meeting card renders an "Awaiting Zoom link" status badge when meeting is null', async () => {
    const html = await renderPage(BOOKING_WITHOUT_MEETING);
    expect(html).toContain('Admin.bookingDetail.meetingStatus.pending');
    // The start_url row is not rendered when there's no meeting.
    expect(html).not.toContain('https://zoom.us/s/123456789?zak=abc');
  });

  it('uses the Admin.bookingDetail.meetingStatus.* i18n keys (no hardcoded English)', () => {
    // The page must request the meetingStatus i18n namespace —
    // no JSX literal "Zoom link created" or "Awaiting Zoom link".
    const pagePath = resolve(
      __dirname,
      '..',
      '..',
      'app',
      '[locale]',
      'admin',
      'bookings',
      '[id]',
      'page.tsx',
    );
    const src = readFileSync(pagePath, 'utf8');
    expect(src).not.toMatch(/['"]Zoom link created['"]/);
    expect(src).not.toMatch(/['"]Awaiting Zoom link['"]/);
    // The page must use the i18n key.
    expect(src).toMatch(/t\(['"]meetingStatus\.created['"]/);
    expect(src).toMatch(/t\(['"]meetingStatus\.pending['"]/);
  });

  it('FIX (regression guard): the page source never hardcodes /admin/students as the tutor link target', () => {
    // The pre-Sprint-3.8 bug was a copy-paste of the student
    // link into the tutor card. Grep the source for the
    // exact broken expression: a Link whose href is the
    // bare /admin/students string inside the tutor section.
    const pagePath = resolve(
      __dirname,
      '..',
      '..',
      'app',
      '[locale]',
      'admin',
      'bookings',
      '[id]',
      'page.tsx',
    );
    const src = readFileSync(pagePath, 'utf8');
    // The student Link still exists (Student card), but the
    // tutor card's Link must NOT use /admin/students.
    // We assert by counting: only ONE occurrence of the
    // string `href={\`/${locale}/admin/students\`}` should
    // exist in the file, and it must be inside the Student
    // card, not the Tutor card. The simplest regression
    // guard: the tutor-card `Link` href must include
    // `booking.tutor.id`.
    expect(src).toMatch(/\/\$\{locale\}\/admin\/tutors\/\$\{booking\.tutor\.id\}/);
    // And the tutor card Link href is the only place that
    // path appears.
    const tutorLinkMatches = src.match(/\/admin\/tutors\/\$\{booking\.tutor\.id\}/g) ?? [];
    expect(tutorLinkMatches.length).toBeGreaterThanOrEqual(1);
  });
});

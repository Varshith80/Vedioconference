import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// =====================================================================
// Sprint 3.7 — Admin Bookings (read-only).
//
// One source of truth for the admin Bookings list + detail pages.
//
// The v2 booking model wires a booked live session through five
// tables:
//
//   session_bookings          — the booking row itself
//     ├─ student_id   → profiles        (Student)
//     ├─ tutor_id     → tutors          (Tutor)
//     │                  └─ profile_id → profiles  (Tutor's user record)
//     ├─ session_id   → sessions        (Session, the curriculum atom)
//     │                  └─ chapter_id → chapters → courses → programs
//     │                                          └─ grade_id   → grades
//     ├─ session_grant_id → session_grants (Payment unit)
//     │                  └─ id → payments   (Stripe ledger row)
//     └─ meeting_link  (1:1, nullable)  → meeting_links
//                                       (Zoom join_url / meeting_id / passcode)
//
// Payment join: WHY TWO QUERIES
// -----------------------------
// The real FK chain is:
//
//     session_bookings.session_grant_id ─► session_grants.id
//                                              ▲
//                                              │
//     payments.session_grant_id ──────────────┘
//
// There is **no** direct FK from `session_bookings` to
// `payments`; the two `session_grant_id` columns are
// independent FKs that share a column value (one FK from the
// booking, one FK from the payment). PostgREST's embed syntax
// requires a direct FK from the parent to the embedded table;
// it cannot express "join across a shared column". A single
// nested query like
//
//     payment:payments!payments_session_grant_id_fkey (...)
//
// always errors with `PGRST200` ("Could not find a relationship
// between 'session_bookings' and 'payments' using the hint
// 'payments_session_grant_id_fkey'"). That is not a naming
// bug; it is a structural impossibility for the embed syntax.
//
// The fix is to issue **two** PostgREST queries:
//   1. The booking + its direct joins (everything except
//      `payments`).
//   2. A sibling `payments` query scoped to the set of
//      `session_grant_id`s we just read.
//
// The merge is a `Map<session_grant_id, payment>`. We keep
// the most recent payment per grant (sorted by `created_at`
// desc, then `id` desc) because `BookingWithDetails` is
// 1:1 booking → payment, and a grant can have multiple
// ledger rows (refunds, partial refunds).
//
// The single-query call (`getBookingByIdWithDetails`) needs
// the same treatment: after reading the booking, we look up
// its single grant's payment in a follow-up query.
//
// RLS is still in effect on every round-trip. No service-role
// key is introduced; no schema change is required.
// =====================================================================

export type BookingStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

export interface BookingWithDetails {
  // -- session_bookings (the core row) -----------------------------
  id: string;
  status: BookingStatus;
  scheduled_start: string;
  scheduled_end: string;
  timezone: string | null;
  notes: string | null;
  calendly_event_uri: string | null;
  calendly_invitee_uri: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  rescheduled_from: string | null;
  created_at: string;
  updated_at: string;

  // -- student (profiles) ------------------------------------------
  student: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;

  // -- tutor (tutors + profiles) -----------------------------------
  tutor: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;

  // -- curriculum chain: session → chapter → course → program + grade
  curriculum: {
    session_id: string;
    session_title: string | null;
    chapter_id: string | null;
    chapter_title: string | null;
    course_id: string | null;
    course_title: string | null;
    program_id: string | null;
    program_title: string | null;
    grade_id: string | null;
    grade_title: string | null;
  } | null;

  // -- payment (payments row joined on session_grant_id) -----------
  payment: {
    id: string;
    amount_cents: number;
    currency: string;
    status: PaymentStatus;
    provider: string | null;
    created_at: string;
  } | null;

  // -- meeting (1:1 Zoom meeting, nullable until n8n creates it) ---
  meeting: {
    id: string;
    provider: string;
    meeting_id: string;
    join_url: string;
    passcode: string | null;
    start_url: string | null;
  } | null;
}

// The Supabase select string. **Excludes the `payment:` embed**
// — we fetch payments separately to keep the join expressible
// in PostgREST (see the file-level comment). All other joins
// are real, direct FKs from the parent table.
const BOOKINGS_SELECT = `
  id,
  status,
  scheduled_start,
  scheduled_end,
  timezone,
  notes,
  calendly_event_uri,
  calendly_invitee_uri,
  cancelled_at,
  cancelled_reason,
  rescheduled_from,
  created_at,
  updated_at,
  student:profiles!session_bookings_student_id_fkey (
    id, full_name, email
  ),
  tutor:tutors!session_bookings_tutor_id_fkey (
    id,
    profile:profiles!tutors_profile_id_fkey (
      full_name, email
    )
  ),
  session:sessions!session_bookings_session_id_fkey (
    id, title,
    chapter:chapters!sessions_chapter_id_fkey (
      id, title,
      course:courses!chapters_course_id_fkey (
        id, title,
        program:programs!courses_program_id_fkey (
          id, title
        ),
        grade:grades!courses_grade_id_fkey (
          id, title
        )
      )
    )
  ),
  grant:session_grants!session_bookings_session_grant_id_fkey (
    id
  ),
  meeting:meeting_links!meeting_links_session_booking_id_fkey (
    id, provider, meeting_id, join_url, passcode, start_url
  )
`;

const PAYMENTS_SELECT = `
  id, amount_cents, currency, status, provider, created_at, session_grant_id
`;

interface RawBookingRow {
  id: string;
  status: BookingStatus;
  scheduled_start: string;
  scheduled_end: string;
  timezone: string | null;
  notes: string | null;
  calendly_event_uri: string | null;
  calendly_invitee_uri: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  rescheduled_from: string | null;
  created_at: string;
  updated_at: string;
  student: { id: string; full_name: string | null; email: string | null } | null;
  tutor: {
    id: string;
    profile: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
  } | null;
  session: {
    id: string;
    title: string | null;
    chapter: {
      id: string;
      title: string | null;
      course: {
        id: string;
        title: string | null;
        program: { id: string; title: string | null } | { id: string; title: string | null }[] | null;
        grade: { id: string; title: string | null } | { id: string; title: string | null }[] | null;
      } | null;
    } | null;
  } | null;
  grant: {
    id: string;
  } | null;
  meeting: {
    id: string;
    provider: string;
    meeting_id: string;
    join_url: string;
    passcode: string | null;
    start_url: string | null;
  } | null;
}

interface RawPaymentRow {
  id: string;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  provider: string | null;
  created_at: string;
  session_grant_id: string;
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function toBookingWithDetails(
  row: RawBookingRow,
  paymentByGrant: ReadonlyMap<string, RawPaymentRow>,
): BookingWithDetails {
  const tutorProfile = first(row.tutor?.profile);
  const course = row.session?.chapter?.course ?? null;
  const program = first(course?.program);
  const grade = first(course?.grade);
  const payment = row.grant ? paymentByGrant.get(row.grant.id) ?? null : null;

  return {
    id: row.id,
    status: row.status,
    scheduled_start: row.scheduled_start,
    scheduled_end: row.scheduled_end,
    timezone: row.timezone,
    notes: row.notes,
    calendly_event_uri: row.calendly_event_uri,
    calendly_invitee_uri: row.calendly_invitee_uri,
    cancelled_at: row.cancelled_at,
    cancelled_reason: row.cancelled_reason,
    rescheduled_from: row.rescheduled_from,
    created_at: row.created_at,
    updated_at: row.updated_at,
    student: row.student
      ? {
          id: row.student.id,
          full_name: row.student.full_name,
          email: row.student.email,
        }
      : null,
    tutor: row.tutor
      ? {
          id: row.tutor.id,
          full_name: tutorProfile?.full_name ?? null,
          email: tutorProfile?.email ?? null,
        }
      : null,
    curriculum: row.session
      ? {
          session_id: row.session.id,
          session_title: row.session.title,
          chapter_id: row.session.chapter?.id ?? null,
          chapter_title: row.session.chapter?.title ?? null,
          course_id: course?.id ?? null,
          course_title: course?.title ?? null,
          program_id: program?.id ?? null,
          program_title: program?.title ?? null,
          grade_id: grade?.id ?? null,
          grade_title: grade?.title ?? null,
        }
      : null,
    payment: payment
      ? {
          id: payment.id,
          amount_cents: payment.amount_cents,
          currency: payment.currency,
          status: payment.status,
          provider: payment.provider,
          created_at: payment.created_at,
        }
      : null,
    meeting: row.meeting
      ? {
          id: row.meeting.id,
          provider: row.meeting.provider,
          meeting_id: row.meeting.meeting_id,
          join_url: row.meeting.join_url,
          passcode: row.meeting.passcode,
          start_url: row.meeting.start_url,
        }
      : null,
  };
}

// Fetch the most recent payment for each grant in `grantIds`.
// Returns a `Map<session_grant_id, payment>` so callers can do
// `O(1)` lookup by grant. Returns an empty map when there are
// no grants to look up. Failures degrade to an empty map; the
// booking is still rendered with `payment = null`.
async function fetchPaymentsByGrant(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClientUntyped>>,
  grantIds: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, RawPaymentRow>> {
  if (grantIds.length === 0) return new Map();
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(PAYMENTS_SELECT)
      .in('session_grant_id', [...grantIds])
      // Newest first so the Map keeps the most recent payment
      // per grant (we overwrite older rows).
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw error;
    const out = new Map<string, RawPaymentRow>();
    for (const row of (data ?? []) as unknown as RawPaymentRow[]) {
      if (!out.has(row.session_grant_id)) {
        out.set(row.session_grant_id, row);
      }
    }
    return out;
  } catch (e) {
    logger.error('admin.bookings: payments fetch failed', describeError(e));
    return new Map();
  }
}

// Every booking with its full join, ordered newest first.
// Cached per request — the admin page is RSC, so this is
// a single fetch per render. Returns [] on read failure so
// the page degrades to an empty state (never a 500).
export const getAllBookingsWithDetails = cache(
  async (): Promise<ReadonlyArray<BookingWithDetails>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('session_bookings')
        .select(BOOKINGS_SELECT)
        .order('scheduled_start', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as RawBookingRow[];
      const grantIds = rows.map((r) => r.grant?.id).filter((id): id is string => typeof id === 'string');
      const paymentByGrant = await fetchPaymentsByGrant(supabase, grantIds);
      return rows.map((row) => toBookingWithDetails(row, paymentByGrant));
    } catch (e) {
      logger.error('admin.getAllBookingsWithDetails failed', describeError(e));
      return [];
    }
  },
);

// Single booking by id, with the same join shape. Returns null
// on miss or read failure (so the detail page can call notFound()).
export const getBookingByIdWithDetails = cache(
  async (id: string): Promise<BookingWithDetails | null> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('session_bookings')
        .select(BOOKINGS_SELECT)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as RawBookingRow;
      const grantIds = row.grant?.id ? [row.grant.id] : [];
      const paymentByGrant = await fetchPaymentsByGrant(supabase, grantIds);
      return toBookingWithDetails(row, paymentByGrant);
    } catch (e) {
      logger.error('admin.getBookingByIdWithDetails failed', {
        id,
        ...describeError(e),
      });
      return null;
    }
  },
);

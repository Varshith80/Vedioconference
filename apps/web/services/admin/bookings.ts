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
// We pull all of that in a single Supabase query and project it
// onto a flat `BookingWithDetails` shape. The admin list and the
// admin detail page consume the same shape; the list only renders
// a subset of fields, the detail renders all of them.
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

// The Supabase select string. Trailing `!inner` would force the
// row to be dropped if any of the required joins is missing; we
// keep the joins nullable so that a brand-new booking with no
// meeting / no payment yet still appears in the list.
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
    id,
    payments:payments_payments_session_grant_id_fkey (
      id, amount_cents, currency, status, provider, created_at
    )
  ),
  meeting:meeting_links!meeting_links_session_booking_id_fkey (
    id, provider, meeting_id, join_url, passcode, start_url
  )
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
    payments: { id: string; amount_cents: number; currency: string; status: PaymentStatus; provider: string | null; created_at: string } | { id: string; amount_cents: number; currency: string; status: PaymentStatus; provider: string | null; created_at: string }[] | null;
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

function first<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function toBookingWithDetails(row: RawBookingRow): BookingWithDetails {
  const tutorProfile = first(row.tutor?.profile);
  const course = row.session?.chapter?.course ?? null;
  const program = first(course?.program);
  const grade = first(course?.grade);
  const payment = first(row.grant?.payments);

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
      return ((data ?? []) as unknown as RawBookingRow[]).map(toBookingWithDetails);
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
      return toBookingWithDetails(data as unknown as RawBookingRow);
    } catch (e) {
      logger.error('admin.getBookingByIdWithDetails failed', {
        id,
        ...describeError(e),
      });
      return null;
    }
  },
);

import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// =====================================================================
// Sprint 8 — B-19 admin session-bookings list.
//
// A surgical, read-only service for the new /admin/session-bookings
// page. We avoid reusing services/admin/bookings.ts (Sprint 3.7)
// because that service fans out into a large join with payments,
// tutors, and the full curriculum chain — the manual-complete
// page only needs the bare-minimum row shape to identify the
// booking and decide whether the per-row action is allowed.
//
// The query is intentionally narrow: id, student_id, session_id,
// scheduled_start, status. The list page shows a UUID-prefix
// for student and session plus the scheduled_start timestamp
// and status badge. We do not pull profiles / sessions /
// grants into this view — they live on the existing
// /admin/bookings detail page for the rare case where an
// admin needs the full row.
// =====================================================================

export type AdminSessionBookingStatus =
  | 'pending_payment'
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export interface AdminSessionBooking {
  id: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  tutorId: string | null;
  tutorName: string | null;
  sessionId: string;
  sessionTitle: string | null;
  chapterTitle: string | null;
  courseTitle: string | null;
  scheduledStart: string;
  status: AdminSessionBookingStatus;
}

/**
 * Non-terminal session bookings, newest first. The filter is
 * applied client-side because the RLS-respecting SSR client
 * already scopes us to the admin role, and the non-terminal
 * set is small (low hundreds at most). If the table grows,
 * swap this for an `.in('status', [...])` on the DB side.
 *
 * Sprint 9 — P1-4 fix: the read now joins profiles, sessions,
 * chapters and courses so the admin row renders meaningful
 * names instead of UUID prefixes. The page no longer needs to
 * fan out N follow-up lookups; one round-trip serves the whole
 * list. Tutor name is NOT joined here — `session_bookings`
 * has a FK to `tutors` but the join string is the same one
 * used by services/admin/bookings.ts (which we deliberately
 * did not import to keep this slice surgical). The page does
 * a single follow-up `getAllTutors()` call to resolve names.
 *
 * Throws on Supabase error so the admin page can build an
 * `AdminFetchResult` envelope through `safeAdminFetch()`.
 */
export const getAdminSessionBookings = cache(
  async (): Promise<ReadonlyArray<AdminSessionBooking>> => {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('session_bookings')
      .select(
        `
          id,
          student_id,
          session_id,
          scheduled_start,
          status,
          student:profiles!session_bookings_student_id_fkey (
            id, full_name, email
          ),
          session:sessions!session_bookings_session_id_fkey (
            id, title, tutor_id,
            chapter:chapters!sessions_chapter_id_fkey (
              id, title,
              course:courses!chapters_course_id_fkey (
                id, title
              )
            )
          )
        `,
      )
      .order('scheduled_start', { ascending: false })
      .limit(200);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      student_id: string;
      session_id: string;
      scheduled_start: string;
      status: string;
      student: { id: string; full_name: string | null; email: string | null } | null;
      session: {
        id: string;
        title: string | null;
        tutor_id: string | null;
        chapter: {
          id: string;
          title: string | null;
          course: { id: string; title: string | null } | null;
        } | null;
      } | null;
    }>;
    const NON_TERMINAL: ReadonlySet<string> = new Set([
      'pending_payment',
      'scheduled',
      'confirmed',
    ]);
    return rows
      .filter((r) => NON_TERMINAL.has(r.status))
      .map((r) => ({
        id: r.id,
        studentId: r.student_id,
        studentName: r.student?.full_name ?? null,
        studentEmail: r.student?.email ?? null,
        tutorId: r.session?.tutor_id ?? null,
        tutorName: null, // resolved by the page from getAllTutors()
        sessionId: r.session_id,
        sessionTitle: r.session?.title ?? null,
        chapterTitle: r.session?.chapter?.title ?? null,
        courseTitle: r.session?.chapter?.course?.title ?? null,
        scheduledStart: r.scheduled_start,
        status: r.status as AdminSessionBookingStatus,
      }));
  },
);
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
  sessionId: string;
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
 * Returns [] on read failure so the page degrades to an
 * empty state.
 */
export const getAdminSessionBookings = cache(
  async (): Promise<ReadonlyArray<AdminSessionBooking>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('session_bookings')
        .select('id, student_id, session_id, scheduled_start, status')
        .order('scheduled_start', { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        student_id: string;
        session_id: string;
        scheduled_start: string;
        status: string;
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
          sessionId: r.session_id,
          scheduledStart: r.scheduled_start,
          status: r.status as AdminSessionBookingStatus,
        }));
    } catch (e) {
      logger.error('admin.getAdminSessionBookings failed', describeError(e));
      return [];
    }
  },
);
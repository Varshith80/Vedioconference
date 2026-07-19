import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient, createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type {
  SessionBooking,
  SessionBookingWithDetails,
  MeetingLink,
} from '@/types/domain';

/**
 * `services/curriculum/session-bookings.ts` — the new unit
 * of a live session. One `session_bookings` row per booked
 * slot. The unit of a Zoom meeting in Sprint 3.5+.
 *
 * Calendly is the source of truth for `scheduled_start` /
 * `scheduled_end`; the Calendly webhook calls the new
 * `/api/session-bookings` route which calls into this
 * service.
 */

export type CreateBookingResult =
  | { kind: 'ok'; booking: SessionBooking }
  | { kind: 'grant_not_active' }
  | { kind: 'session_not_in_grant' }
  | { kind: 'session_not_found' };

/**
 * Fetch all session bookings for the current student, with
 * session + chapter + meeting link eagerly joined. Used by
 * `/[locale]/dashboard/sessions` and `/[locale]/dashboard/bookings`.
 */
export const getStudentSessionBookings = cache(
  async (studentId: string): Promise<ReadonlyArray<SessionBookingWithDetails>> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('session_bookings')
        .select(
          '*, session:sessions(*, chapter:chapters(*)), meeting:meeting_links!session_booking_id(*)',
        )
        .eq('student_id', studentId)
        .order('scheduled_start', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReadonlyArray<SessionBookingWithDetails>;
    } catch (e) {
      logger.error('getStudentSessionBookings failed', { studentId, ...describeError(e) });
      return [];
    }
  },
);

/**
 * Fetch a single session booking by its id (no joins).
 */
export const getSessionBooking = cache(
  async (id: string): Promise<SessionBooking | null> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('session_bookings')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SessionBooking | null;
    } catch (e) {
      logger.error('getSessionBooking failed', { id, ...describeError(e) });
      return null;
    }
  },
);

/**
 * Fetch a single session booking by its id, with its
 * session, chapter, and meeting link eagerly joined. Used
 * by `/[locale]/dashboard/sessions/[id]`.
 */
export const getSessionBookingWithDetails = cache(
  async (id: string): Promise<SessionBookingWithDetails | null> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('session_bookings')
        .select(
          '*, session:sessions(*, chapter:chapters(*)), meeting:meeting_links!session_booking_id(*)',
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SessionBookingWithDetails | null;
    } catch (e) {
      logger.error('getSessionBookingWithDetails failed', { id, ...describeError(e) });
      return null;
    }
  },
);

/**
 * Insert a new `scheduled` session booking. The caller must
 * have already validated that:
 *   1. The session_grant is `active` (or `pending_payment`,
 *      but `active` is the normal case).
 *   2. The session_id matches the session covered by the
 *      grant (the API route does this check before calling
 *      here).
 *
 * `tutorId` is optional. When the caller does not pass one
 * (or passes `null`), the new booking's `tutor_id` defaults
 * to the parent session's `tutor_id` (Sprint 3.8 plan §11).
 * Bookings created before this default existed keep the
 * `tutor_id` they were created with — historical immutability
 * (Sprint 3.8 plan §17).
 *
 * Returns a discriminated-union result so the route handler
 * can map it to a structured HTTP response.
 */
export async function createSessionBooking(args: {
  studentId: string;
  sessionId: string;
  sessionGrantId: string;
  scheduledStart: string; // ISO 8601
  scheduledEnd: string; // ISO 8601
  calendlyInviteeUri?: string;
  /** Optional. When null/undefined, the parent session's
   *  `tutor_id` is used. */
  tutorId?: string | null;
}): Promise<CreateBookingResult> {
  try {
    const supabase = await createSupabaseServerClientUntyped();

    // Defensive sanity check: the session must exist and be
    // the same one the grant covers.
    const { data: session, error: sErr } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', args.sessionId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!session) return { kind: 'session_not_found' };

    const { data: grant, error: gErr } = await supabase
      .from('session_grants')
      .select('*')
      .eq('id', args.sessionGrantId)
      .maybeSingle();
    if (gErr) throw gErr;
    if (!grant) return { kind: 'grant_not_active' };

    const grantRow = grant as unknown as { session_id: string; status: string };
    if (grantRow.session_id !== args.sessionId) {
      return { kind: 'session_not_in_grant' };
    }
    if (!['active', 'pending_payment', 'completed'].includes(grantRow.status)) {
      return { kind: 'grant_not_active' };
    }

    // Sprint 3.8 §11: when the caller did not pass a tutor,
    // default to the parent session's assigned tutor. The
    // explicit argument still wins.
    //
    // The boundary cast to a record is intentional: the
    // `sessions.tutor_id` column is new (migration
    // 20260719000001) and will appear on the Session type
    // after `pnpm db:types` regen. We read it off the raw
    // session object so this code compiles before AND after
    // the regen.
    const sessRecord = session as unknown as Record<string, unknown>;
    const sessionTutorId =
      typeof sessRecord['tutor_id'] === 'string'
        ? (sessRecord['tutor_id'] as string)
        : null;
    const resolvedTutorId = args.tutorId ?? sessionTutorId;

    const { data, error } = await supabase
      .from('session_bookings')
      .insert({
        student_id: args.studentId,
        session_id: args.sessionId,
        session_grant_id: args.sessionGrantId,
        tutor_id: resolvedTutorId,
        scheduled_start: args.scheduledStart,
        scheduled_end: args.scheduledEnd,
        calendly_invitee_uri: args.calendlyInviteeUri ?? null,
        status: 'scheduled',
      } as never)
      .select('*')
      .single();
    if (error) throw error;
    return { kind: 'ok', booking: data as unknown as SessionBooking };
  } catch (e) {
    logger.error('createSessionBooking failed', { args, ...describeError(e) });
    throw e;
  }
}

/**
 * Cancel a session booking. The caller must be the booking
 * owner, the assigned tutor, or an admin (route handler
 * enforces this before calling).
 */
export async function cancelSessionBooking(
  bookingId: string,
  cancelledReason?: string,
): Promise<SessionBooking | null> {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('session_bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_reason: cancelledReason ?? null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', bookingId)
      .in('status', ['scheduled', 'confirmed'])
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data as unknown as SessionBooking | null;
  } catch (e) {
    logger.error('cancelSessionBooking failed', { bookingId, ...describeError(e) });
    return null;
  }
}

/**
 * Type re-export for callers that need the `MeetingLink`
 * shape. Keeps the import surface narrow.
 */
export type { MeetingLink };

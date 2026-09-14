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
 *   2. For PAYG (`grant_type='individual'`) grants: the
 *      `session_id` matches the session covered by the grant.
 *      For POOL grants (`grant_type in ('pack', 'subscription')`):
 *      the `session_id` IS NULL on the grant row by design —
 *      the booking's `session_id` is the student's chosen
 *      session, NOT the pool's session (the pool has none).
 *      Feature C — TASK 3 / D-3: subscription pool consumed
 *      FIRST when both subscription + pack pools exist;
 *      `pickSubscriptionPoolFirst` picks the pool id before
 *      this service is called.
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

    // Defensive sanity check: the session must exist.
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

    const grantRow = grant as unknown as {
      session_id: string | null;
      status: string;
      grant_type: 'individual' | 'pack' | 'subscription' | string;
    };

    // PAYG (individual) grants MUST be linked to the chosen
    // session — the grant's session_id IS the booked session.
    // Pool grants (pack / subscription) have session_id=NULL
    // by design — the booking carries the chosen session.
    if (grantRow.grant_type === 'individual') {
      if (grantRow.session_id !== args.sessionId) {
        return { kind: 'session_not_in_grant' };
      }
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
 * Sprint 8 — B-19 manual-complete. Move a session booking to
 * `completed` from any non-terminal status. The route layer
 * must enforce the admin role (manual-complete is a back-office
 * tool, not a user-facing action). The transition is allowed
 * from `scheduled` / `confirmed` only — moving from a
 * terminal state (`completed`, `cancelled`, `no_show`,
 * `rescheduled`) is a 409 to prevent the admin from
 * accidentally rewriting history.
 *
 * We intentionally do NOT auto-mark `no_show` — when the
 * admin does not attend the call, that is a separate
 * client-owned decision (the booking stays in its current
 * status until the admin either completes or no-shows it).
 *
 * Returns the updated booking, or `null` when the row did
 * not transition (idempotent: if already `completed`, returns
 * the row as-is; if in a terminal non-completed state,
 * returns `null` to signal "no transition happened").
 */
export type ManualCompleteResult =
  | { kind: 'ok'; booking: SessionBooking }
  | { kind: 'already_terminal'; booking: SessionBooking }
  | { kind: 'not_found' };

export async function manualCompleteSessionBooking(
  bookingId: string,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClientUntyped>>,
): Promise<ManualCompleteResult> {
  const client =
    supabase ?? (await createSupabaseServerClientUntyped());

  // Load first to detect terminal state and report a clean 409.
  const { data: existing, error: loadErr } = await client
    .from('session_bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();
  if (loadErr) {
    logger.error('manualComplete load failed', {
      bookingId,
      ...describeError(loadErr),
    });
    throw loadErr;
  }
  if (!existing) return { kind: 'not_found' };
  const row = existing as unknown as SessionBooking;

  if (row.status === 'completed') {
    return { kind: 'already_terminal', booking: row };
  }
  // Other terminal states cannot be silently rewritten.
  if (
    row.status === 'cancelled' ||
    row.status === 'no_show' ||
    row.status === 'rescheduled'
  ) {
    return { kind: 'already_terminal', booking: row };
  }

  try {
    const { data, error } = await client
      .from('session_bookings')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', bookingId)
      .select('*')
      .single();
    if (error) throw error;
    return { kind: 'ok', booking: data as unknown as SessionBooking };
  } catch (e) {
    logger.error('manualComplete update failed', {
      bookingId,
      ...describeError(e),
    });
    throw e;
  }
}

/**
 * D-3 (Feature C — Monthly Support): pick the pool to consume
 * from. Subscription pool FIRST when active and has remaining
 * credits (it expires sooner — at `current_period_end` — than
 * a Pack pool which has a 6-month horizon). Pack pool SECOND.
 * Returns `null` when neither pool exists (the caller falls back
 * to PAYG `createPendingSessionGrant`).
 *
 * The existing `fn_consume_pack_credit` BEFORE INSERT trigger
 * (migration `20260825000001`) atomically debits 1 credit from
 * the chosen pool id; this function only PICKS the pool id —
 * it does not debit.
 *
 * RLS-respecting: the student sees their own pool rows only.
 */
export async function pickSubscriptionPoolFirst(
  studentId: string,
): Promise<{ grantId: string; source: 'subscription' | 'pack' } | null> {
  try {
    const supabase = await createSupabaseServerClient();

    // 1. Subscription pool — only if the parent subscription is active.
    const { data: subPool, error: subErr } = await supabase
      .from('session_grants')
      .select('id, total_credits, consumed_credits, status')
      .eq('student_id', studentId)
      .eq('grant_type', 'subscription')
      .eq('status', 'active')
      .gt('total_credits', 0) // belt-and-braces (CHECK also enforces)
      .maybeSingle();
    if (subErr) throw subErr;
    const subRow = subPool as unknown as {
      id: string;
      total_credits: number | null;
      consumed_credits: number;
      status: string;
    } | null;
    if (subRow
        && subRow.status === 'active'
        && (subRow.total_credits ?? 0) > subRow.consumed_credits) {
      return { grantId: subRow.id, source: 'subscription' };
    }

    // 2. Pack pool — only if active AND not expired.
    const { data: packPool, error: packErr } = await supabase
      .from('session_grants')
      .select('id, total_credits, consumed_credits, status, expires_at')
      .eq('student_id', studentId)
      .eq('grant_type', 'pack')
      .eq('status', 'active')
      .gt('total_credits', 0)
      .maybeSingle();
    if (packErr) throw packErr;
    const packRow = packPool as unknown as {
      id: string;
      total_credits: number | null;
      consumed_credits: number;
      expires_at: string | null;
      status: string;
    } | null;
    if (packRow
        && packRow.status === 'active'
        && (packRow.total_credits ?? 0) > packRow.consumed_credits
        && (packRow.expires_at === null || new Date(packRow.expires_at).getTime() > Date.now())) {
      return { grantId: packRow.id, source: 'pack' };
    }

    return null;
  } catch (e) {
    logger.error('pickSubscriptionPoolFirst failed', {
      studentId,
      ...describeError(e),
    });
    return null;
  }
}

/**
 * Type re-export for callers that need the `MeetingLink`
 * shape. Keeps the import surface narrow.
 */
export type { MeetingLink };

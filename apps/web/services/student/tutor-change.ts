import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  ApiError,
  Conflict,
  Forbidden,
  NotFound,
  describeError,
  notNullViolationToBadRequest,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import {
  assertNoCooldown,
  recordSuccessfulTutorChange,
} from '@/services/student/tutor-change-cooldown';
import type {
  CreateTutorChangeRequestInput,
  StudentSelectAlternativeInput,
} from '@/lib/validations/tutor-change';

// =====================================================================
// Sprint 6 — Student-side tutor-change-request service.
//
// All helpers are cache()-wrapped for shared roundtrips on the
// RSC dashboard surface. Read helpers return [] / null on failure
// (never throw). Write helpers throw typed ApiError subclasses.
//
// Authorisation model
// -------------------
// The student is always identified by the SSR session (`auth.uid()`).
// Every row in `public.tutor_change_requests` is scoped to that
// uid via the `student_id = auth.uid()` check (RLS policy
// `tutor_change_requests_select_own` + insert/update policies).
// The untyped Supabase client runs on behalf of the user — we do
// NOT need the admin client for student reads or student INSERT.
//
// `studentSelectAlternative` DOES use the admin client because the
// service is also responsible for re-pointing
// `session_bookings.tutor_id` after the student selects. That
// re-pointing is an UPDATE on `session_bookings` and the student
// does not have the privilege to mutate the booking's tutor
// directly (the booking's tutor is part of the platform's
// assignment, not a student-controlled field). The student still
// owns the RLS-gated write on the request row itself.
//
// Type-safety note
// ----------------
// The untyped Supabase factory returns `never`-typed chains for
// tables not in the hand-maintained `Database` type. We use
// `as never` casts on payloads at the boundary (CLAUDE.md §3.9,
// documented escape hatch in services/admin/tutors.ts) and
// type-annotate the read rows at the consumer. This keeps the
// route layer and the RSC pages free of `any`.
// =====================================================================

/** One hour, in milliseconds. */
const SLA_HOURS_MS = 24 * 60 * 60 * 1000;

/** Status enum as a string union (DB stores text + CHECK). */
export type TutorChangeRequestStatus =
  | 'pending'
  | 'alternatives_proposed'
  | 'student_selected'
  | 'completed'
  | 'cancelled';

/** Row shape returned by the `tutor_change_requests` select. */
export interface TutorChangeRequestRow {
  id: string;
  student_id: string;
  session_booking_id: string;
  current_tutor_id: string;
  status: TutorChangeRequestStatus;
  requested_at: string;
  sla_deadline: string;
  responded_at: string | null;
  proposed_alternative_tutor_ids: ReadonlyArray<string>;
  selected_tutor_id: string | null;
  student_reason: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Strongly-typed shape consumed by the RSC dashboard + API. */
export interface TutorChangeRequest {
  id: string;
  student_id: string;
  session_booking_id: string;
  current_tutor_id: string;
  status: TutorChangeRequestStatus;
  requested_at: string;
  sla_deadline: string;
  responded_at: string | null;
  proposed_alternative_tutor_ids: ReadonlyArray<string>;
  selected_tutor_id: string | null;
  student_reason: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  /** Derived: true when `status === 'pending' && sla_deadline < now`. */
  overdue: boolean;
}

const TUTOR_CHANGE_REQUEST_SELECT = [
  'id',
  'student_id',
  'session_booking_id',
  'current_tutor_id',
  'status',
  'requested_at',
  'sla_deadline',
  'responded_at',
  'proposed_alternative_tutor_ids',
  'selected_tutor_id',
  'student_reason',
  'admin_notes',
  'created_at',
  'updated_at',
].join(', ');

function rowToRequest(row: TutorChangeRequestRow): TutorChangeRequest {
  return {
    id: row.id,
    student_id: row.student_id,
    session_booking_id: row.session_booking_id,
    current_tutor_id: row.current_tutor_id,
    status: row.status,
    requested_at: row.requested_at,
    sla_deadline: row.sla_deadline,
    responded_at: row.responded_at ?? null,
    proposed_alternative_tutor_ids: row.proposed_alternative_tutor_ids ?? [],
    selected_tutor_id: row.selected_tutor_id ?? null,
    student_reason: row.student_reason ?? null,
    admin_notes: row.admin_notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    overdue: computeOverdue(row.status, row.sla_deadline),
  };
}

/** Pure helper. Exported for unit tests. */
export function computeOverdue(
  status: TutorChangeRequestStatus,
  slaDeadline: string,
): boolean {
  if (status !== 'pending') return false;
  const deadline = new Date(slaDeadline).getTime();
  if (Number.isNaN(deadline)) return false;
  return deadline < Date.now();
}

/** Pure helper. Exported for unit tests. */
export function computeSlaDeadline(requestedAtIso: string): string {
  const t = new Date(requestedAtIso).getTime();
  if (Number.isNaN(t)) {
    throw new ApiError(400, 'bad_request', 'Invalid requested_at.');
  }
  return new Date(t + SLA_HOURS_MS).toISOString();
}

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

/** List the signed-in student's own requests, newest first. */
export const getMyRequests = cache(
  async (): Promise<ReadonlyArray<TutorChangeRequest>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('tutor_change_requests')
        .select(TUTOR_CHANGE_REQUEST_SELECT)
        .order('requested_at', { ascending: false });

      if (error) {
        logger.warn('getMyRequests failed', { error: describeError(error) });
        return [];
      }
      const rows = (data ?? []) as ReadonlyArray<TutorChangeRequestRow>;
      return rows.map(rowToRequest);
    } catch (e) {
      logger.warn('getMyRequests threw', { error: describeError(e) });
      return [];
    }
  },
);

/** Fetch a single request by id, scoped to the signed-in student. */
export const getMyRequestById = cache(
  async (
    id: string,
  ): Promise<TutorChangeRequest | null> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('tutor_change_requests')
        .select(TUTOR_CHANGE_REQUEST_SELECT)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.warn('getMyRequestById failed', {
          id,
          error: describeError(error),
        });
        return null;
      }
      if (!data) return null;
      return rowToRequest(data as unknown as TutorChangeRequestRow);
    } catch (e) {
      logger.warn('getMyRequestById threw', {
        id,
        error: describeError(e),
      });
      return null;
    }
  },
);

// ---------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------

/**
 * Create a new tutor-change request on behalf of the signed-in
 * student. The application computes `sla_deadline = now + 24h`.
 *
 * Pre-flight checks (all performed via the SSR client so RLS
 * enforces ownership):
 *   1. `session_bookings` row exists and `student_id = auth.uid()`.
 *   2. The booking's current `tutor_id` is non-null (a booking
 *      without an assigned tutor cannot have a tutor "change").
 *   3. The booking is in an open status (scheduled / confirmed /
 *      rescheduled). Cancelled / completed / no-show are denied.
 *   4. No OPEN change request already exists for the same booking
 *      (the DB partial unique index enforces this too — we
 *      surface a friendly 409 on conflict).
 */
export async function createRequest(
  input: CreateTutorChangeRequestInput,
): Promise<TutorChangeRequest> {
  const supabase = await createSupabaseServerClientUntyped();

  // ---- Sprint 6.5 — global per-student 24h cooldown gate ------
  // Throws `TutorChangeCooldownActiveError` (code:
  // 'tutor_change_cooldown_active') when the student has had a
  // successful tutor reassignment within the previous 24 hours.
  // The route layer catches the error and returns HTTP 409 with
  // the timing details. The BEFORE INSERT trigger in
  // `20260915000001_student_tutor_change_events_cooldown.sql`
  // is the un-bypassable server-side backstop for any future
  // code path that forgets to call this gate.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw Forbidden('Sign in required.');
  await assertNoCooldown(user.id, supabase);

  // ---- Look up the booking --------------------------------------
  const { data: booking, error: bookingError } = await supabase
    .from('session_bookings')
    .select('id, student_id, tutor_id, status')
    .eq('id', input.session_booking_id)
    .maybeSingle();

  if (bookingError) {
    logger.error('createRequest booking lookup failed', {
      error: describeError(bookingError),
    });
    throw new ApiError(500, 'server_error', 'Unable to load booking.');
  }
  if (!booking) throw NotFound('Booking not found.');

  const bookingRow = booking as {
    id: string;
    student_id: string;
    tutor_id: string | null;
    status: string;
  };

  // The SSR client runs as auth.uid(); RLS already gates the
  // read, but we re-check defensively so a future RLS regression
  // does not leak ownership logic to the route layer.
  if (user.id !== bookingRow.student_id) {
    throw Forbidden('You do not own this booking.');
  }

  const currentTutorId = bookingRow.tutor_id;
  if (!currentTutorId) {
    throw new ApiError(
      400,
      'bad_request',
      'This booking has no assigned tutor to change.',
    );
  }

  if (
    bookingRow.status === 'cancelled' ||
    bookingRow.status === 'completed' ||
    bookingRow.status === 'no_show'
  ) {
    throw new ApiError(
      400,
      'bad_request',
      `Cannot request a tutor change on a ${bookingRow.status} booking.`,
    );
  }

  // ---- Insert the request ---------------------------------------
  const now = new Date().toISOString();
  const slaDeadline = computeSlaDeadline(now);

  const insertPayload = {
    student_id: user.id,
    session_booking_id: bookingRow.id,
    current_tutor_id: currentTutorId,
    status: 'pending' as const,
    requested_at: now,
    sla_deadline: slaDeadline,
    student_reason: input.student_reason ?? null,
    proposed_alternative_tutor_ids: [],
  };

  const { data, error } = await supabase
    .from('tutor_change_requests')
    .insert(insertPayload as never)
    .select(TUTOR_CHANGE_REQUEST_SELECT)
    .single();

  if (error || !data) {
    const msg = describeError(error);
    const msgStr = typeof msg === 'string' ? msg : String(msg);
    logger.error('createRequest insert failed', { error: msg });
    // Unique-violation on the partial open-per-booking index.
    if (/uq_tutor_change_requests_open_per_booking/u.test(msgStr)) {
      throw Conflict(
        'You already have an open tutor-change request for this booking.',
      );
    }
    throw notNullViolationToBadRequest(error) ??
      new ApiError(500, 'server_error', 'Unable to create request.');
  }

  return rowToRequest(data as unknown as TutorChangeRequestRow);
}

/**
 * Student picks one of the alternatives the admin proposed.
 *
 * Steps:
 *   1. Load the request (RLS-scoped to the student).
 *   2. Verify status === 'alternatives_proposed' and the chosen
 *      tutor is in `proposed_alternative_tutor_ids`.
 *   3. Flip status to 'student_selected' (RLS policy
 *      `tutor_change_requests_student_select_alternative`
 *      enforces the column-shape rules).
 *   4. Re-point `session_bookings.tutor_id` via the admin client
 *      (student cannot update the booking's tutor directly).
 *   5. Mark the request as 'completed' (via admin path; the
 *      student UPDATE policy only allows the
 *      'student_selected' flip — the final 'completed' status
 *      is an admin write).
 */
export async function selectAlternative(
  id: string,
  input: StudentSelectAlternativeInput,
): Promise<TutorChangeRequest> {
  const userClient = await createSupabaseServerClientUntyped();

  // ---- Step 1: load the request ----------------------------------
  const { data: existing, error: loadErr } = await userClient
    .from('tutor_change_requests')
    .select(TUTOR_CHANGE_REQUEST_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (loadErr || !existing) {
    logger.warn('selectAlternative load failed', {
      id,
      error: describeError(loadErr),
    });
    throw NotFound('Tutor change request not found.');
  }
  const row = existing as unknown as TutorChangeRequestRow;

  // ---- Step 2: pre-flight checks --------------------------------
  if (row.status !== 'alternatives_proposed') {
    throw new ApiError(
      400,
      'bad_request',
      'Alternatives are not currently proposed for this request.',
    );
  }
  if (!row.proposed_alternative_tutor_ids.includes(input.selected_tutor_id)) {
    throw new ApiError(
      400,
      'bad_request',
      'The selected tutor is not in the proposed alternatives.',
    );
  }
  if (input.selected_tutor_id === row.current_tutor_id) {
    throw new ApiError(
      400,
      'bad_request',
      'The selected tutor is the same as the current tutor.',
    );
  }

  // ---- Step 3: flip status to 'student_selected' ----------------
  const statusUpdate = {
    selected_tutor_id: input.selected_tutor_id,
    status: 'student_selected' as const,
  };

  const { data: updated, error: updateErr } = await userClient
    .from('tutor_change_requests')
    .update(statusUpdate as never)
    .eq('id', id)
    .select(TUTOR_CHANGE_REQUEST_SELECT)
    .single();

  if (updateErr || !updated) {
    logger.error('selectAlternative status flip failed', {
      id,
      error: describeError(updateErr),
    });
    throw new ApiError(
      500,
      'server_error',
      'Unable to record the tutor selection.',
    );
  }

  // ---- Step 4 + 5: re-point booking + close the request --------
  // Done via the admin client. The student RLS UPDATE policy
  // intentionally blocks the 'completed' status flip — it must
  // happen here, alongside the booking re-pointing.
  const admin = createSupabaseAdminClient();
  const { error: bookingErr } = await admin
    .from('session_bookings')
    .update({ tutor_id: input.selected_tutor_id } as never)
    .eq('id', row.session_booking_id);

  if (bookingErr) {
    logger.error('selectAlternative booking re-point failed', {
      requestId: id,
      bookingId: row.session_booking_id,
      error: describeError(bookingErr),
    });
    throw new ApiError(
      500,
      'server_error',
      'Unable to update the booking. The request status was changed; contact support.',
    );
  }

  // ---- Sprint 6.5 — record the successful reassignment --------
  // This is the canonical cooldown-start event. The student just
  // completed a tutor change successfully, so the global 24h
  // cooldown must start now. Submitted / rejected / cancelled /
  // failed paths do NOT reach this code. The event is keyed by
  // `request_id` (UNIQUE) so a retried call is a no-op.
  const recordResult = await recordSuccessfulTutorChange({
    studentId: row.student_id,
    bookingId: row.session_booking_id,
    fromTutorId: row.current_tutor_id,
    toTutorId: input.selected_tutor_id,
    requestId: row.id,
  });
  if (!recordResult.ok && recordResult.code === 'unknown') {
    // The booking re-point already succeeded. The cooldown
    // event is the audit trail; a write failure here is logged
    // but does not roll back the booking. The next request
    // will hit the trigger / RPC and surface the missing event.
    logger.error('selectAlternative cooldown record failed', {
      requestId: id,
    });
  }

  const { data: closed, error: closeErr } = await admin
    .from('tutor_change_requests')
    .update({
      status: 'completed',
      responded_at: new Date().toISOString(),
    } as never)
    .eq('id', id)
    .select(TUTOR_CHANGE_REQUEST_SELECT)
    .single();

  if (closeErr || !closed) {
    logger.error('selectAlternative close failed', {
      id,
      error: describeError(closeErr),
    });
    throw new ApiError(
      500,
      'server_error',
      'Tutor was updated; closing the request failed. Contact support.',
    );
  }

  return rowToRequest(closed as unknown as TutorChangeRequestRow);
}

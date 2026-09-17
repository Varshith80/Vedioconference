import 'server-only';
import { cache } from 'react';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  BadRequest,
  Conflict,
  NotFound,
  ServerError,
  describeError,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type {
  AdminProposeAlternativesInput,
  AdminResolveRequestInput,
} from '@/lib/validations/tutor-change';
import {
  computeOverdue,
  type TutorChangeRequest,
  type TutorChangeRequestRow,
  type TutorChangeRequestStatus,
} from '@/services/student/tutor-change';
import { recordSuccessfulTutorChange } from '@/services/student/tutor-change-cooldown';

// =====================================================================
// Sprint 6 — Admin-side tutor-change-request service.
//
// Every helper runs through the admin client because the admin
// path needs to bypass the student-scoped RLS policies (admin
// policy `tutor_change_requests_admin_all` already authorises the
// writes, but `auth.uid()` for an admin user is still themselves
// — using the admin client removes any chance of an RLS surprise
// on the re-point write to `session_bookings`).
//
// Reads are cache()-wrapped for shared roundtrips on the admin
// list/detail page. Writes throw typed ApiError subclasses.
//
// Type-safety note
// ----------------
// The untyped Supabase factory returns `never`-typed chains for
// tables not in the hand-maintained `Database` type. We use
// `as never` casts on payloads at the boundary (CLAUDE.md §3.9,
// documented escape hatch in services/admin/tutors.ts) and
// type-annotate the read rows at the consumer.
// =====================================================================

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

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

/**
 * List every tutor-change request, newest first. Admin-only.
 *
 * The optional `statusFilter` lets the list page filter on
 * `pending | alternatives_proposed | student_selected | completed
 * | cancelled`. When omitted, all statuses are returned.
 */
export async function getAllRequests(
  statusFilter?: TutorChangeRequestStatus,
): Promise<ReadonlyArray<TutorChangeRequest>> {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from('tutor_change_requests')
    .select(TUTOR_CHANGE_REQUEST_SELECT)
    .order('requested_at', { ascending: false });
  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('getAllRequests failed', { error: describeError(error) });
    throw ServerError('Unable to load tutor change requests.');
  }
  const rows = (data ?? []) as unknown as ReadonlyArray<TutorChangeRequestRow>;
  return rows.map(rowToRequest);
}

/**
 * Scan overdue pending rows. Used by the SLA cron. We do NOT
 * cache here — the cron runs at most once every few minutes
 * and a stale read is cheaper than a cache invalidation
 * strategy.
 */
export async function getOverduePendingRequests(): Promise<
  ReadonlyArray<TutorChangeRequest>
> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('tutor_change_requests')
    .select(TUTOR_CHANGE_REQUEST_SELECT)
    .eq('status', 'pending')
    .lt('sla_deadline', new Date().toISOString());

  if (error) {
    logger.error('getOverduePendingRequests failed', {
      error: describeError(error),
    });
    throw ServerError('Unable to scan overdue requests.');
  }
  const rows = (data ?? []) as unknown as ReadonlyArray<TutorChangeRequestRow>;
  return rows.map(rowToRequest);
}

/** Fetch a single request by id (admin scope). */
export const getRequestById = cache(
  async (id: string): Promise<TutorChangeRequest | null> => {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('tutor_change_requests')
      .select(TUTOR_CHANGE_REQUEST_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.error('getRequestById failed', {
        id,
        error: describeError(error),
      });
      throw ServerError('Unable to load request.');
    }
    if (!data) return null;
    return rowToRequest(data as unknown as TutorChangeRequestRow);
  },
);

// ---------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------

/**
 * Admin proposes 1..3 alternative tutors for a pending request.
 *
 * State transition: any status -> 'alternatives_proposed'.
 *
 * Validations:
 *   - The request must exist.
 *   - The request must still be in a state that accepts a
 *     proposal (pending or alternatives_proposed — re-proposing
 *     overwrites the previous list).
 *   - Each alternative tutor id must reference an existing row
 *     in `public.tutors` (validated via SELECT count).
 *   - `current_tutor_id` must NOT appear in the alternatives
 *     (the whole point is to change the tutor).
 */
export async function proposeAlternatives(
  id: string,
  input: AdminProposeAlternativesInput,
): Promise<TutorChangeRequest> {
  const admin = createSupabaseAdminClient();

  // ---- Load the request -----------------------------------------
  const { data: existing, error: loadErr } = await admin
    .from('tutor_change_requests')
    .select(TUTOR_CHANGE_REQUEST_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (loadErr || !existing) {
    logger.warn('proposeAlternatives load failed', {
      id,
      error: describeError(loadErr),
    });
    throw NotFound('Tutor change request not found.');
  }
  const row = existing as unknown as TutorChangeRequestRow;

  if (
    row.status === 'completed' ||
    row.status === 'cancelled' ||
    row.status === 'student_selected'
  ) {
    throw BadRequest(`Cannot propose alternatives on a ${row.status} request.`);
  }

  // De-dupe the input list, in case the form sent the same id
  // twice (the Zod schema does not dedupe — the UI may pick
  // duplicates by accident).
  const unique = Array.from(new Set(input.alternative_tutor_ids));
  if (unique.includes(row.current_tutor_id)) {
    throw BadRequest('Alternatives must not include the current tutor.');
  }

  // ---- Validate tutor ids exist ----------------------------------
  const { count, error: tutorErr } = await admin
    .from('tutors')
    .select('id', { count: 'exact', head: true })
    .in('id', unique);

  if (tutorErr) {
    logger.error('proposeAlternatives tutor lookup failed', {
      id,
      error: describeError(tutorErr),
    });
    throw ServerError('Unable to validate alternative tutors.');
  }
  if (!count || count !== unique.length) {
    throw BadRequest('One or more alternative tutors do not exist.');
  }

  // ---- Write the proposal ---------------------------------------
  const now = new Date().toISOString();
  const updatePayload = {
    proposed_alternative_tutor_ids: unique,
    status: 'alternatives_proposed' as const,
    responded_at: now,
  };

  const { data, error } = await admin
    .from('tutor_change_requests')
    .update(updatePayload as never)
    .eq('id', id)
    .select(TUTOR_CHANGE_REQUEST_SELECT)
    .single();

  if (error || !data) {
    logger.error('proposeAlternatives update failed', {
      id,
      error: describeError(error),
    });
    throw ServerError('Unable to record the proposal.');
  }
  return rowToRequest(data as unknown as TutorChangeRequestRow);
}

/**
 * Admin resolves a request.
 *
 * Two flavours:
 *   - `selected_tutor_id` supplied: re-point the booking and
 *     close the request as 'completed'.
 *   - `selected_tutor_id` omitted: record `admin_notes` and
 *     cancel the request as 'cancelled'.
 *
 * Validations:
 *   - The request must exist.
 *   - Status must be 'pending' or 'alternatives_proposed'.
 *   - If `selected_tutor_id` is supplied, it must differ from
 *     `current_tutor_id` and must reference an existing tutor.
 */
export async function resolveRequest(
  id: string,
  input: AdminResolveRequestInput,
): Promise<TutorChangeRequest> {
  const admin = createSupabaseAdminClient();

  // ---- Load the request -----------------------------------------
  const { data: existing, error: loadErr } = await admin
    .from('tutor_change_requests')
    .select(TUTOR_CHANGE_REQUEST_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (loadErr || !existing) {
    logger.warn('resolveRequest load failed', {
      id,
      error: describeError(loadErr),
    });
    throw NotFound('Tutor change request not found.');
  }
  const row = existing as unknown as TutorChangeRequestRow;

  if (
    row.status === 'completed' ||
    row.status === 'cancelled' ||
    row.status === 'student_selected'
  ) {
    throw Conflict(`Request is already ${row.status}.`);
  }

  const now = new Date().toISOString();
  let nextStatus: TutorChangeRequestStatus;
  let selectedTutorId: string | null = row.selected_tutor_id ?? null;

  if (input.selected_tutor_id) {
    if (input.selected_tutor_id === row.current_tutor_id) {
      throw BadRequest(
        'selected_tutor_id must differ from current_tutor_id.',
      );
    }

    // Validate the chosen tutor exists.
    const { data: tutor, error: tutorErr } = await admin
      .from('tutors')
      .select('id')
      .eq('id', input.selected_tutor_id)
      .maybeSingle();

    if (tutorErr || !tutor) {
      throw BadRequest(
        'selected_tutor_id does not reference an existing tutor.',
      );
    }

    // Re-point the booking.
    const { error: bookingErr } = await admin
      .from('session_bookings')
      .update({ tutor_id: input.selected_tutor_id } as never)
      .eq('id', row.session_booking_id);

    if (bookingErr) {
      logger.error('resolveRequest booking re-point failed', {
        id,
        error: describeError(bookingErr),
      });
      throw ServerError('Unable to update the booking.');
    }

    // ---- Sprint 6.5 — record the successful reassignment --------
    // The student just had their tutor changed by the admin —
    // this is the canonical cooldown-start event. The `cancelled`
    // branch below does NOT reach this code, so cancellation
    // does NOT start the cooldown.
    const recordResult = await recordSuccessfulTutorChange({
      studentId: row.student_id,
      bookingId: row.session_booking_id,
      fromTutorId: row.current_tutor_id,
      toTutorId: input.selected_tutor_id,
      requestId: row.id,
    });
    if (!recordResult.ok && recordResult.code === 'unknown') {
      logger.error('resolveRequest cooldown record failed', { id });
    }

    selectedTutorId = input.selected_tutor_id;
    nextStatus = 'completed';
  } else {
    nextStatus = 'cancelled';
  }

  // ---- Write the resolution -------------------------------------
  const updatePayload = {
    status: nextStatus,
    selected_tutor_id: selectedTutorId,
    admin_notes: input.admin_notes ?? row.admin_notes ?? null,
    responded_at: now,
  };

  const { data, error } = await admin
    .from('tutor_change_requests')
    .update(updatePayload as never)
    .eq('id', id)
    .select(TUTOR_CHANGE_REQUEST_SELECT)
    .single();

  if (error || !data) {
    logger.error('resolveRequest update failed', {
      id,
      error: describeError(error),
    });
    throw ServerError('Unable to record the resolution.');
  }
  return rowToRequest(data as unknown as TutorChangeRequestRow);
}

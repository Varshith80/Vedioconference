import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { describeError } from '@/lib/utils/errors';
import {
  COOLDOWN_HOURS_MS,
  formatCooldownRemaining,
  isInCooldown,
  nextEligibleAt,
} from '@/lib/tutor-change-cooldown-helpers';

// Re-export the pure helpers so the service surface is a single
// import for callers that already use the service (the form
// component, by contrast, imports the helpers directly from
// `@/lib/tutor-change-cooldown-helpers` because it is a Client
// Component and cannot import a `server-only` module).
export {
  COOLDOWN_HOURS_MS,
  formatCooldownRemaining,
  isInCooldown,
  nextEligibleAt,
};

// =====================================================================
// Sprint 6.5 — Feature G cooldown service.
//
// Pure helpers + a service-role-keyed RPC caller. The
// `recordSuccessfulTutorChange` writer is the authoritative write
// path for `student_tutor_change_events`; this service file is the
// only caller.
//
// Pure helpers (isInCooldown, nextEligibleAt, formatCooldownRemaining,
// COOLDOWN_HOURS_MS) live in `@/lib/tutor-change-cooldown-helpers`
// so Client Components can use them without importing a
// `server-only` module. They are re-exported above for callers
// that already depend on this service.
//
// Race-safety
// -----------
// Three layers protect the cooldown:
//   1. Advisory transaction lock in the RPC (Phase 6.5+ future;
//      currently the BEFORE INSERT trigger in
//      20260915000001_student_tutor_change_events_cooldown.sql is
//      the un-bypassable backstop).
//   2. UNIQUE INDEX on `request_id` — idempotency. A retried
//      `recordSuccessfulTutorChange` produces SQLSTATE 23505,
//      which this service translates to
//      `ok: false, code: 'already_recorded'`.
//   3. BEFORE INSERT trigger on `tutor_change_requests`
//      (`trg_student_tutor_change_events_cooldown`) — fires inside
//      the INSERT transaction. Raises P0001 with message
//      `tutor_change_cooldown_active:<remaining_ms>`. The route
//      layer catches P0001 and returns HTTP 409.
//
// Authorisation
// -------------
// - `getStudentTutorChangeCooldown` + `assertNoCooldown` use the
//   caller's RLS-respecting server client. The student can only
//   see their own events (RLS policy
//   `stc_events_select_own`).
// - `recordSuccessfulTutorChange` uses the service-role admin
//   client. This is one of the existing call sites for the
//   admin client (the student + admin routes that complete a
//   tutor reassignment already use it to re-point
//   `session_bookings.tutor_id`). The boundary is unchanged.
// =====================================================================

/** Snapshot of a student's cooldown state. */
export interface StudentCooldownStatus {
  lastChangedAt: Date | null;
  inCooldown: boolean;
  remainingMs: number;
  nextEligibleAt: Date | null;
}

/**
 * Read the most-recent event for the student. RLS-respecting;
 * the caller's server client is used so a student can only see
 * their own events.
 *
 * Failures (RLS-denied, table-missing, network) resolve to
 * "no event" rather than throwing — the cooldown gate is
 * fail-open at the read layer and fail-closed at the
 * trigger layer.
 */
export async function getStudentTutorChangeCooldown(
  studentId: string,
  supabase: SupabaseClient,
): Promise<StudentCooldownStatus> {
  try {
    const { data, error } = await supabase
      .from('student_tutor_change_events')
      .select('changed_at')
      .eq('student_id', studentId)
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn('getStudentTutorChangeCooldown failed', {
        studentId,
        error: describeError(error),
      });
      return {
        lastChangedAt: null,
        inCooldown: false,
        remainingMs: 0,
        nextEligibleAt: null,
      };
    }

    const lastIso = (data as { changed_at?: string } | null)?.changed_at;
    if (!lastIso) {
      return {
        lastChangedAt: null,
        inCooldown: false,
        remainingMs: 0,
        nextEligibleAt: null,
      };
    }

    const lastChangedAt = new Date(lastIso);
    if (Number.isNaN(lastChangedAt.getTime())) {
      return {
        lastChangedAt: null,
        inCooldown: false,
        remainingMs: 0,
        nextEligibleAt: null,
      };
    }

    const inCooldown = isInCooldown(lastChangedAt);
    const remainingMs = inCooldown
      ? Math.max(0, nextEligibleAt(lastChangedAt).getTime() - Date.now())
      : 0;
    return {
      lastChangedAt,
      inCooldown,
      remainingMs,
      nextEligibleAt: inCooldown ? nextEligibleAt(lastChangedAt) : null,
    };
  } catch (e) {
    logger.warn('getStudentTutorChangeCooldown threw', {
      studentId,
      error: describeError(e),
    });
    return {
      lastChangedAt: null,
      inCooldown: false,
      remainingMs: 0,
      nextEligibleAt: null,
    };
  }
}

/** Result of a successful reassignment write. */
export type RecordSuccessfulTutorChangeResult =
  | { ok: true; changedAt: Date }
  | { ok: false; code: 'already_recorded' | 'unknown' };

/**
 * Record a successful tutor reassignment. Called from the two
 * completion paths:
 *   - `services/student/tutor-change.ts:selectAlternative`
 *   - `services/admin/tutor-change.ts:resolveRequest`
 *     (`selected_tutor_id` branch — `cancelled` is excluded)
 *
 * Uses the service-role admin client to bypass RLS for the write.
 * The student route and the admin route are the only callers; the
 * service-role import is unchanged from the existing
 * `app/api/webhooks/**` + `app/api/auth/register/**` boundary —
 * we are not extending the boundary.
 *
 * Race-safety: the UNIQUE INDEX on `request_id` makes the insert
 * idempotent. SQLSTATE 23505 → `ok: false, code: 'already_recorded'`.
 */
export async function recordSuccessfulTutorChange(input: {
  studentId: string;
  bookingId: string;
  fromTutorId: string;
  toTutorId: string;
  requestId: string;
}): Promise<RecordSuccessfulTutorChangeResult> {
  if (input.fromTutorId === input.toTutorId) {
    // Defence in depth: the DB CHECK already forbids this, but
    // the service should never invoke a no-op write.
    return { ok: false, code: 'already_recorded' };
  }
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('student_tutor_change_events')
      .insert({
        student_id: input.studentId,
        booking_id: input.bookingId,
        from_tutor_id: input.fromTutorId,
        to_tutor_id: input.toTutorId,
        request_id: input.requestId,
      } as never)
      .select('changed_at')
      .single();

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === '23505') {
        return { ok: false, code: 'already_recorded' };
      }
      logger.error('recordSuccessfulTutorChange insert failed', {
        requestId: input.requestId,
        error: describeError(error),
      });
      return { ok: false, code: 'unknown' };
    }
    const changedAtIso = (data as { changed_at: string }).changed_at;
    return { ok: true, changedAt: new Date(changedAtIso) };
  } catch (e) {
    logger.error('recordSuccessfulTutorChange threw', {
      requestId: input.requestId,
      error: describeError(e),
    });
    return { ok: false, code: 'unknown' };
  }
}

/**
 * Discriminated error thrown by `assertNoCooldown`. The route
 * layer pattern-matches on `e.code === 'tutor_change_cooldown_active'`
 * and translates it to the HTTP 409 envelope.
 */
export interface TutorChangeCooldownActiveError extends Error {
  code: 'tutor_change_cooldown_active';
  details: {
    next_eligible_at: string;
    remaining_ms: number;
    last_changed_at: string;
  };
}

function makeCooldownError(
  status: StudentCooldownStatus,
): TutorChangeCooldownActiveError {
  const err = new Error('tutor_change_cooldown_active') as TutorChangeCooldownActiveError;
  err.code = 'tutor_change_cooldown_active';
  err.details = {
    next_eligible_at: (status.nextEligibleAt ?? new Date()).toISOString(),
    remaining_ms: status.remainingMs,
    last_changed_at: (status.lastChangedAt ?? new Date()).toISOString(),
  };
  return err;
}

/**
 * Throw a discriminated cooldown error when the student is in
 * cooldown. No-op when the student is not. Called as the FIRST
 * line of `createRequest` so the cooldown gate fires before any
 * other validation.
 */
export async function assertNoCooldown(
  studentId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const status = await getStudentTutorChangeCooldown(studentId, supabase);
  if (status.inCooldown && status.nextEligibleAt && status.lastChangedAt) {
    throw makeCooldownError(status);
  }
}

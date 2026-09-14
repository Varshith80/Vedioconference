import 'server-only';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { Session, SessionGrant } from '@/types/domain';

// =====================================================================
// Phase 1 — Feature A: First free 60-minute session.
//
// Pricing Q6 (Pricing & Session Rules):
//   - One 60-minute trial per student, NOT per course/program/subject.
//   - Student cannot stack trials by switching subjects.
//   - Goes through the normal Stripe Checkout (n8n) flow with a 100%
//     discount coupon. NOT a free-bypass — the Stripe customer
//     profile and the `payments` row are still created.
//   - Server-enforced, race-safe.
//
// Architecture
// ------------
// A free trial is a `session_grants` row with:
//   - `is_trial = true`
//   - `amount_cents = 0`
//   - `session_id` set to the chosen session (it's a real session
//     the student will attend, not a phantom grant).
//
// The RACE-SAFETY gate is the partial unique index
// `uq_session_grants_one_trial_per_student` introduced by the
// migration `20260913000003_free_trial_session_grant.sql`.
// Two parallel inserts of `is_trial = true` for the same student
// both reach the index; only one wins. The losing caller receives
// SQLSTATE 23505 which the service translates to
// `{ kind: 'free_trial_already_used' }`.
//
// The 100% discount is delivered as a Stripe coupon
// (`COURSENLIGNE_FREE_TRIAL`). The coupon is reconciled via the
// existing `coupons` table (migration 20260707000008). The
// service `getOrCreateFreeTrialCoupon()` looks up or creates the
// coupon row and returns its id; the API route then passes the
// coupon id to the n8n `enrollment-created` workflow, which is
// responsible for applying the coupon at Stripe Checkout
// session-creation time. n8n is the only system that calls
// Stripe for the booking path (CLAUDE.md §2.3).
//
// Cancellation/refund semantics
// ----------------------------
// A `cancelled` or `refunded` trial does NOT count as "used":
// the student can try again. This is what
// `hasUsedFreeTrial` and the partial unique index both check
// (the index covers `pending_payment | active | completed`).
// =====================================================================

/** Standard trial duration — 60 minutes, locked. Pricing Q6. */
export const FREE_TRIAL_DURATION_MIN = 60;

/** Canonical code for the 100% trial coupon row. */
const FREE_TRIAL_COUPON_CODE = 'COURSENLIGNE_FREE_TRIAL';

export type StartFreeTrialResult =
  | { kind: 'ok'; grant: SessionGrant }
  | { kind: 'session_not_found' }
  | { kind: 'session_price_missing' }
  | { kind: 'free_trial_already_used'; existingGrantId: string | null };

/**
 * Pure helper. Returns true when a student has already used
 * their free trial — a `session_grants` row exists with
 * `is_trial = true` and status in (active, completed,
 * pending_payment). A `cancelled` or `refunded` trial does NOT
 * count (the student can re-attempt).
 */
export function hasUsedFreeTrial(
  grants: ReadonlyArray<{ is_trial: boolean | null; status: string }>,
): boolean {
  return grants.some(
    (g) =>
      g.is_trial === true &&
      (g.status === 'active' ||
        g.status === 'completed' ||
        g.status === 'pending_payment'),
  );
}

/**
 * Read-only check used by the dashboard and the trial-start
 * API. Returns true when the student has a trial grant that has
 * not been cancelled or refunded.
 */
export async function getFreeTrialStatus(
  studentId: string,
): Promise<{
  used: boolean;
  grantId: string | null;
  status: 'active' | 'completed' | 'pending_payment' | null;
}> {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('session_grants')
      .select('id, status, is_trial')
      .eq('student_id', studentId)
      .eq('is_trial', true)
      .in('status', ['active', 'completed', 'pending_payment'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logger.warn('getFreeTrialStatus failed', {
        studentId,
        error: describeError(error),
      });
      return { used: false, grantId: null, status: null };
    }
    if (!data) return { used: false, grantId: null, status: null };
    const row = data as unknown as {
      id: string;
      status: 'active' | 'completed' | 'pending_payment';
      is_trial: boolean;
    };
    return { used: true, grantId: row.id, status: row.status };
  } catch (e) {
    logger.warn('getFreeTrialStatus threw', {
      studentId,
      error: describeError(e),
    });
    return { used: false, grantId: null, status: null };
  }
}

/**
 * Look up the existing 100% trial coupon in the `coupons` table
 * or create one if none exists. Idempotent: re-running for the
 * same code returns the same coupon id.
 *
 * Returns `null` if the coupons table is unreachable (the API
 * route then surfaces a 503 `coupon_unavailable`).
 */
export async function getOrCreateFreeTrialCoupon(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const { data: existing, error: lookupErr } = await supabase
      .from('coupons')
      .select('id')
      .eq('code', FREE_TRIAL_COUPON_CODE)
      .eq('is_active', true)
      .maybeSingle();
    if (lookupErr) {
      logger.warn('getOrCreateFreeTrialCoupon lookup failed', {
        error: describeError(lookupErr),
      });
      return null;
    }
    if (existing) {
      return (existing as unknown as { id: string }).id;
    }
    const { data: created, error: insertErr } = await supabase
      .from('coupons')
      .insert({
        code: FREE_TRIAL_COUPON_CODE,
        kind: 'percent',
        percent_off: 100,
        currency: 'EUR',
        is_active: true,
        max_redemptions: null,
        redeemed_count: 0,
        metadata: { kind: 'free_trial', notes: 'Pricing Q6: one per student' },
      } as never)
      .select('id')
      .single();
    if (insertErr) {
      logger.error('getOrCreateFreeTrialCoupon create failed', {
        error: describeError(insertErr),
      });
      return null;
    }
    return (created as unknown as { id: string }).id;
  } catch (e) {
    logger.error('getOrCreateFreeTrialCoupon threw', {
      error: describeError(e),
    });
    return null;
  }
}

/**
 * Insert a new `pending_payment` trial session grant for the
 * given (student, session) pair with `is_trial = true` and
 * `amount_cents = 0`.
 *
 * Returns a discriminated-union result:
 *   - `ok`                              — trial grant created.
 *   - `session_not_found`               — invalid session id.
 *   - `session_price_missing`           — session has no price
 *                                         configured. (Defensive:
 *                                         a trial is €0, but we
 *                                         require a real session
 *                                         row to keep the
 *                                         existing CHECK invariants
 *                                         happy.)
 *   - `free_trial_already_used`         — student already has an
 *                                         active/completed/
 *                                         pending trial grant.
 *                                         The service returns the
 *                                         existing grant id (if
 *                                         found) so the caller can
 *                                         surface a friendly error.
 *
 * Race-safety
 * -----------
 * The partial unique index
 * `uq_session_grants_one_trial_per_student` is the race-safety
 * backstop. A concurrent `startFreeTrialSessionGrant` call for
 * the same student both reach the index; only one wins. The
 * losing caller gets SQLSTATE 23505 which is translated to
 * `free_trial_already_used`.
 */
export async function startFreeTrialSessionGrant(
  studentId: string,
  sessionId: string,
): Promise<StartFreeTrialResult> {
  try {
    const supabase = await createSupabaseServerClientUntyped();

    // 1. Resolve the session.
    const { data: session, error: sErr } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    if (sErr) {
      logger.error('startFreeTrialSessionGrant session lookup failed', {
        studentId,
        sessionId,
        error: describeError(sErr),
      });
      throw sErr;
    }
    if (!session) return { kind: 'session_not_found' };
    const sess = session as unknown as Session;
    if (sess.price_cents == null) {
      return { kind: 'session_price_missing' };
    }

    // 2. Pre-flight check (also enforced by the unique index).
    const { data: existing, error: eErr } = await supabase
      .from('session_grants')
      .select('id')
      .eq('student_id', studentId)
      .eq('is_trial', true)
      .in('status', ['active', 'completed', 'pending_payment'])
      .maybeSingle();
    if (eErr) {
      logger.error('startFreeTrialSessionGrant existing check failed', {
        studentId,
        error: describeError(eErr),
      });
      throw eErr;
    }
    if (existing) {
      return {
        kind: 'free_trial_already_used',
        existingGrantId: (existing as unknown as { id: string }).id,
      };
    }

    // 3. Insert the trial grant. amount_cents = 0 (€0.00). The
    //    Stripe charge is a 100% discount on the session's
    //    nominal price; the student's card is not actually
    //    charged but the Stripe customer profile and the
    //    `payments` row are created (Pricing Q6 — we DO go
    //    through Stripe, not around it).
    const { data, error } = await supabase
      .from('session_grants')
      .insert({
        student_id: studentId,
        session_id: sessionId,
        status: 'pending_payment',
        amount_cents: 0,
        currency: sess.currency,
        is_trial: true,
        metadata: { kind: 'free_trial', source: 'pricing_q6' },
      } as never)
      .select('*')
      .single();
    if (error) {
      const code = (error as { code?: string }).code;
      const msg = describeError(error);
      const msgStr = typeof msg === 'string' ? msg : JSON.stringify(msg);
      if (
        code === '23505' ||
        /uq_session_grants_one_trial_per_student/u.test(msgStr)
      ) {
        // Race: a concurrent call beat us. Look up the
        // winning row and report it.
        const { data: winner } = await supabase
          .from('session_grants')
          .select('id')
          .eq('student_id', studentId)
          .eq('is_trial', true)
          .in('status', ['active', 'completed', 'pending_payment'])
          .maybeSingle();
        return {
          kind: 'free_trial_already_used',
          existingGrantId:
            (winner as unknown as { id: string } | null)?.id ?? null,
        };
      }
      logger.error('startFreeTrialSessionGrant insert failed', {
        studentId,
        sessionId,
        error: msg,
      });
      throw error;
    }
    return { kind: 'ok', grant: data as unknown as SessionGrant };
  } catch (e) {
    logger.error('startFreeTrialSessionGrant failed', {
      studentId,
      sessionId,
      error: describeError(e),
    });
    throw e;
  }
}

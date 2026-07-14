import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient, createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type {
  SessionGrant,
  SessionGrantWithDetails,
  Session,
} from '@/types/domain';

/**
 * `services/curriculum/session-grants.ts` — the new unit of
 * payment. One `session_grant` row per (student, session)
 * for the active grant.
 *
 * Per the user-approved Sprint 3.5 plan:
 *   - `createPendingSessionGrant` MUST return
 *     `{ kind: 'session_price_missing' }` if the linked
 *     `sessions.price_cents` is NULL (the price has not been
 *     imported from the Excel yet — Sprint 5 work).
 *   - No placeholder price is hardcoded anywhere. The route
 *     handler is responsible for turning
 *     `session_price_missing` into a 422 response.
 */

export type CreatePendingGrantResult =
  | { kind: 'ok'; grant: SessionGrant }
  | { kind: 'session_price_missing' }
  | { kind: 'duplicate_active_grant'; grant: SessionGrant }
  | { kind: 'session_not_found' };

/**
 * Fetch all session grants for the current student, with
 * the session + chapter + course + program + grade eagerly
 * joined. Used by `/[locale]/dashboard/programs` and
 * `/[locale]/dashboard/sessions`.
 */
export const getStudentSessionGrants = cache(
  async (studentId: string): Promise<ReadonlyArray<SessionGrantWithDetails>> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('session_grants')
        .select(
          '*, session:sessions(*, chapter:chapters(*, course:courses(*, program:programs(*), grade:grades(*))))',
        )
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReadonlyArray<SessionGrantWithDetails>;
    } catch (e) {
      logger.error('getStudentSessionGrants failed', { studentId, ...describeError(e) });
      return [];
    }
  },
);

/**
 * Fetch a single session grant by its id (no joins). Used
 * by the API route handlers.
 */
export const getSessionGrant = cache(
  async (id: string): Promise<SessionGrant | null> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('session_grants')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SessionGrant | null;
    } catch (e) {
      logger.error('getSessionGrant failed', { id, ...describeError(e) });
      return null;
    }
  },
);

/**
 * Insert a new `pending_payment` session grant for the given
 * (student, session) pair.
 *
 * Returns a discriminated-union result so the route handler
 * can map it to a structured HTTP response. Critically:
 *
 *   - If `sessions.price_cents` is NULL, returns
 *     `{ kind: 'session_price_missing' }`. The caller MUST
 *     turn this into a 422 with a structured error body.
 *   - If an active grant already exists (the partial unique
 *     index `uq_session_grants_active_student_session` will
 *     fire on insert), returns `{ kind: 'duplicate_active_grant' }`.
 *   - If the session does not exist, returns
 *     `{ kind: 'session_not_found' }`.
 *
 * The service uses the untyped client (route handler
 * context) because it must mutate the `session_grants`
 * table; the RSC-typed client is read-only by RLS.
 */
export async function createPendingSessionGrant(
  studentId: string,
  sessionId: string,
): Promise<CreatePendingGrantResult> {
  try {
    const supabase = await createSupabaseServerClientUntyped();

    // First fetch the session to check its price.
    const { data: session, error: sErr } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!session) return { kind: 'session_not_found' };

    const sess = session as unknown as Session;
    if (sess.price_cents == null) {
      return { kind: 'session_price_missing' };
    }

    // Reject if an active grant already exists.
    const { data: existing, error: eErr } = await supabase
      .from('session_grants')
      .select('*')
      .eq('student_id', studentId)
      .eq('session_id', sessionId)
      .in('status', ['pending_payment', 'active'])
      .maybeSingle();
    if (eErr) throw eErr;
    if (existing) {
      return { kind: 'duplicate_active_grant', grant: existing as unknown as SessionGrant };
    }

    const { data, error } = await supabase
      .from('session_grants')
      .insert({
        student_id: studentId,
        session_id: sessionId,
        status: 'pending_payment',
        amount_cents: sess.price_cents,
        currency: sess.currency,
        metadata: {},
      } as never)
      .select('*')
      .single();
    if (error) throw error;
    return { kind: 'ok', grant: data as unknown as SessionGrant };
  } catch (e) {
    logger.error('createPendingSessionGrant failed', { studentId, sessionId, ...describeError(e) });
    throw e;
  }
}

/**
 * Flip a `pending_payment` session grant to `active` and
 * record `paid_at` and (optionally) the Stripe payment
 * intent id. Called by the Stripe webhook.
 */
export async function markSessionGrantPaid(
  grantId: string,
  stripeSessionId: string,
  stripePaymentIntentId?: string,
): Promise<SessionGrant | null> {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('session_grants')
      .update({
        status: 'active',
        paid_at: new Date().toISOString(),
        stripe_session_id: stripeSessionId,
        stripe_payment_intent_id: stripePaymentIntentId ?? null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', grantId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data as unknown as SessionGrant | null;
  } catch (e) {
    logger.error('markSessionGrantPaid failed', { grantId, ...describeError(e) });
    return null;
  }
}

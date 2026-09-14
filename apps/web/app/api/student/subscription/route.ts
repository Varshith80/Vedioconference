import { type NextRequest } from 'next/server';
import { createSupabaseServerClient, createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, Unauthorized, NotFound } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import {
  getStudentSubscription,
  getSubscriptionPeriodHistory,
  requestCancelAtPeriodEnd,
} from '@/services/curriculum/monthly-subscriptions';

/**
 * GET /api/student/subscription — return the student's current
 * subscription view + the historical pool grants.
 *
 * RLS-respecting: the read goes through `getStudentSubscription`
 * (uses the cookie-authenticated server client + RLS).
 *
 * DELETE /api/student/subscription — student-initiated cancel
 * at period end (D-2). No state change immediately; the period-
 * refresh path at `current_period_end` finalises the cancellation.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('You must be signed in.');

    const sub = await getStudentSubscription(user.id);
    if (!sub) {
      return jsonResponse({
        ok: true as const,
        data: {
          subscription: null,
          current_period_grants: [],
          next_refresh_at: null,
          cancel_at_period_end: false,
          period_end: null,
        },
      });
    }

    const history = await getSubscriptionPeriodHistory(sub.id, user.id);

    // Find the period_grants row matching the current period_start.
    const currentPeriodGrant = history.find(
      (g) => g.period_start === sub.current_period_start,
    );

    return jsonResponse({
      ok: true as const,
      data: {
        subscription: sub,
        current_period_grants: currentPeriodGrant ? [currentPeriodGrant] : [],
        next_refresh_at: sub.current_period_end,
        cancel_at_period_end: sub.cancel_at_period_end,
        period_end: sub.current_period_end,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * DELETE /api/student/subscription — student-initiated cancel.
 *
 * D-2: cancellation is END-OF-PERIOD. The student's request
 * sets `cancel_at_period_end=true`. The subscription remains
 * `status='active'` and the current period's pool grants remain
 * consumable until `current_period_end`. At period end, the
 * period-refresh path (`refreshSubscriptionPeriod`) sees the
 * flag, finalises `status='cancelled'`, stamps `cancelled_at`,
 * and creates NO next-period grant.
 *
 * No refund. No next-period grant.
 */
export async function DELETE(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('You must be signed in.');

    const sub = await getStudentSubscription(user.id);
    if (!sub) throw NotFound('No subscription found.');
    if (sub.status === 'cancelled') throw NotFound('No subscription found.');

    const result = await requestCancelAtPeriodEnd({
      subscriptionId: sub.id,
      studentId: user.id,
    });
    if (result.kind === 'no_subscription') {
      throw NotFound('No subscription found.');
    }
    if (result.kind === 'already_cancelling') {
      throw new ApiError(
        409,
        'subscription_already_cancelling',
        'Your subscription is already scheduled to end at the current period end.',
        { period_end: sub.current_period_end },
      );
    }

    logger.info('student-initiated cancel accepted', {
      studentId: user.id,
      subscriptionId: sub.id,
      periodEnd: result.periodEnd,
    });

    return jsonResponse({
      ok: true as const,
      data: {
        cancel_at_period_end: true,
        period_end: result.periodEnd,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

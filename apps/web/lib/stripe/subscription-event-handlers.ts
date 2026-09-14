import 'server-only';
import type Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import {
  provisionMonthlySubscription,
  refreshSubscriptionPeriod,
  markSubscriptionPastDue,
  markSubscriptionPaymentRecovered,
  markSubscriptionSuspended,
} from '@/services/curriculum/monthly-subscriptions';
import type { EmailLocale } from '@/lib/email/templates/_base';

/**
 * `lib/stripe/subscription-event-handlers.ts` — handlers for
 * Stripe's recurring-billing lifecycle events. Called from
 * `app/api/webhooks/stripe/route.ts` after the signature has
 * been verified and the event has been deduped via
 * `webhook_events` (the existing UNIQUE (provider, event_id)
 * primitive).
 *
 * Locked decisions (user-approved D-1 → D-6):
 *   - D-1: past_due / suspended → existing pool row remains
 *     consumable until `current_period_end`. NO mutation of
 *     `session_grants` rows here.
 *   - D-2: cancellation is end-of-period.
 *   - D-4: idempotency via the existing `n8n_executions`
 *     UNIQUE `run_id` primitive (reused from
 *     `services/admin/pack-grants.ts:executePackRefund`).
 *   - D-5: emails via existing Next.js → Resend layer.
 *   - D-6: Stripe's `current_period_start` /
 *     `current_period_end` are authoritative. NO 30-day
 *     computation anywhere.
 */

// =====================================================================
// Helpers
// =====================================================================

/** Resolve the locale for the subscription's student.
 *  Reads the student's profile.preferred_locale (RLS-bypassed
 *  via admin client). Falls back to 'fr'. */
async function resolveStudentLocale(studentId: string): Promise<EmailLocale> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('preferred_locale')
    .eq('id', studentId)
    .maybeSingle();
  if (error) {
    logger.warn('resolveStudentLocale: profile read failed', {
      studentId,
      ...describeError(error),
    });
    return 'fr';
  }
  const locale = (data as unknown as { preferred_locale?: string } | null)?.preferred_locale;
  return locale === 'en' ? 'en' : 'fr';
}

/** Look up a subscription row by `stripe_subscription_id`.
 *  Returns the row id + the student's auth uid, or null if not
 *  found. */
async function resolveSubscriptionByStripeId(
  stripeSubscriptionId: string,
): Promise<{ subscriptionId: string; studentId: string; currentStatus: string } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('subscriptions')
    .select('id, student_id, status')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();
  if (error) {
    logger.warn('resolveSubscriptionByStripeId: query failed', {
      stripeSubscriptionId,
      ...describeError(error),
    });
    return null;
  }
  if (!data) return null;
  const row = data as unknown as { id: string; student_id: string; status: string };
  return {
    subscriptionId: row.id,
    studentId: row.student_id,
    currentStatus: row.status,
  };
}

/** Look up the student's email + full name. Returns nulls
 *  if the profile is missing. */
async function resolveStudentContact(
  studentId: string,
): Promise<{ email: string | null; fullName: string | null }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('email, full_name')
    .eq('id', studentId)
    .maybeSingle();
  if (error) {
    logger.warn('resolveStudentContact: profile read failed', {
      studentId,
      ...describeError(error),
    });
    return { email: null, fullName: null };
  }
  const row = data as unknown as { email: string | null; full_name: string | null } | null;
  return {
    email: row?.email ?? null,
    fullName: row?.full_name ?? null,
  };
}

// =====================================================================
// customer.subscription.created / updated
// =====================================================================

/**
 * Handle `customer.subscription.created` and
 * `customer.subscription.updated`. The two events share the
 * same shape and the same idempotent-provision path:
 *
 *   - If a `subscriptions` row does NOT exist for this
 *     `stripe_subscription_id` → call `provisionMonthlySubscription`
 *     (creates the subscription + the first period pool + the
 *     period_grants audit row).
 *
 *   - If a `subscriptions` row DOES exist AND its
 *     `current_period_start` differs from Stripe's →
 *     `refreshSubscriptionPeriod` (new period rollover).
 *
 *   - If the status is `past_due` → `markSubscriptionPastDue`.
 *
 *   - If the status moved from `past_due` to `active` →
 *     `markSubscriptionPaymentRecovered`.
 *
 *   - If the status is `cancelled` (and we haven't already
 *     finalised) → `markSubscriptionSuspended` with reason
 *     `stripe_deleted`.
 *
 * D-1: no `session_grants.status` mutation on past_due /
 * suspended. The existing pool row remains consumable.
 *
 * D-6: Stripe's `current_period_start` / `current_period_end`
 * are authoritative.
 */
export async function handleCustomerSubscriptionEvent(
  sub: Stripe.Subscription,
): Promise<void> {
  try {
    const stripeSubId = sub.id;
    const stripeCustomerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const stripePriceId = sub.items.data[0]?.price.id ?? null;
    const periodStart = new Date(sub.current_period_start * 1000);
    const periodEnd = new Date(sub.current_period_end * 1000);
    const status = sub.status; // 'active' | 'trialing' | 'past_due' | 'cancelled' | 'incomplete' | 'incomplete_expired'
    const cancelAtPeriodEnd = sub.cancel_at_period_end === true;
    const latestInvoiceId =
      typeof sub.latest_invoice === 'string'
        ? sub.latest_invoice
        : sub.latest_invoice?.id ?? null;

    // Look up the existing subscription row.
    const existing = await resolveSubscriptionByStripeId(stripeSubId);

    if (!existing) {
      // No subscription row yet. The first-month `checkout.session.completed`
      // handler creates the `subscriptions` row + the first pool grant
      // (the existing path uses `markSessionGrantPaid` for the pool).
      // For `customer.subscription.created` arriving WITHOUT a prior
      // `checkout.session.completed` (e.g. CLI provisioning, retry
      // timing), we provision here.
      //
      // We need the student_id. Stripe's `Subscription.metadata` may
      // carry it — Next.js's checkout route sets `metadata[student_id]`
      // (see `n8n/workflows/enrollment-created.json` L63). Fall back
      // to the Stripe Customer lookup if metadata is missing.
      let studentId: string | null =
        typeof sub.metadata?.student_id === 'string'
          ? sub.metadata.student_id
          : null;

      if (!studentId) {
        // Look up by stripe_customer_id on the profile table.
        const admin = createSupabaseAdminClient();
        const { data: profile, error: pErr } = await admin
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', stripeCustomerId)
          .maybeSingle();
        if (pErr) {
          logger.warn('handleCustomerSubscriptionEvent: profile lookup by stripe_customer_id failed', {
            stripeCustomerId,
            ...describeError(pErr),
          });
        }
        studentId = (profile as unknown as { id: string } | null)?.id ?? null;
      }

      if (!studentId) {
        logger.warn('handleCustomerSubscriptionEvent: cannot resolve student_id, skipping', {
          stripeSubId,
          stripeCustomerId,
        });
        return;
      }

      if (!stripePriceId) {
        logger.warn('handleCustomerSubscriptionEvent: stripe_price_id missing, skipping', {
          stripeSubId,
        });
        return;
      }

      const result = await provisionMonthlySubscription({
        studentId,
        stripeCustomerId,
        stripeSubscriptionId: stripeSubId,
        stripePriceId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        latestInvoiceId,
        stripeEventId: stripeSubId,
      });
      if (result.kind === 'unknown') {
        logger.error('handleCustomerSubscriptionEvent: provision failed', { stripeSubId });
      }
      return;
    }

    // Existing subscription. Status-driven branching.
    const admin = createSupabaseAdminClient();

    if (status === 'past_due') {
      const { email, fullName } = await resolveStudentContact(existing.studentId);
      const locale = await resolveStudentLocale(existing.studentId);
      await markSubscriptionPastDue({
        subscriptionId: existing.subscriptionId,
        stripeEventId: stripeSubId,
        failureReason: sub.cancellation_details?.reason ?? 'invoice.payment_failed',
        studentEmail: email,
        studentName: fullName,
        locale,
        periodEndIso: periodEnd.toISOString(),
      });
      return;
    }

    if (status === 'active' || status === 'trialing') {
      // A/B/C classification (user-approved correction v2):
      //
      //   Class A — genuinely terminal: cancelled_at IS NOT NULL OR
      //             status='cancelled'. A stale Stripe 'active'
      //             webhook landing on a dead row is a NO-OP. We
      //             must not flip status, send recovery email, or
      //             insert a recovery outbox row.
      //
      //   Class B — cancellation pending: cancel_at_period_end=true
      //             AND cancelled_at IS NULL. NOT terminal. The
      //             recovery path is allowed and `markSubscription-
      //             PaymentRecovered` preserves `cancel_at_period_end`
      //             (its UPDATE payload intentionally omits the
      //             column). At `current_period_end` the period-
      //             refresh path finalises the cancellation.
      //
      //   Class C — ordinary active: normal period-rollover /
      //             recovery-from-past_due flow.
      //
      // Read once: cancelled_at, status, cancel_at_period_end,
      // current_period_start, past_due_at.
      const { data: fullRow, error: fullErr } = await admin
        .from('subscriptions')
        .select('status, cancel_at_period_end, cancelled_at, current_period_start, past_due_at')
        .eq('id', existing.subscriptionId)
        .maybeSingle();
      if (fullErr) throw fullErr;
      const row = fullRow as unknown as {
        status: string;
        cancel_at_period_end: boolean;
        cancelled_at: string | null;
        current_period_start: string;
        past_due_at: string | null;
      } | null;

      if (!row) {
        logger.warn('handleCustomerSubscriptionEvent: subscription row vanished mid-flight', {
          stripeSubId,
        });
        return;
      }

      // Class A: terminal — NO-OP. Stripe should not send an
      // 'active' status on a cancelled row, but if a stale event
      // arrives (replay, race), we ignore it.
      if (row.cancelled_at !== null || row.status === 'cancelled') {
        logger.info('handleCustomerSubscriptionEvent: active/trialing on terminal subscription, NO-OP', {
          stripeSubId,
          subscriptionId: existing.subscriptionId,
          cancelled_at: row.cancelled_at,
          status: row.status,
        });
        return;
      }

      const wasPastDue = !!row.past_due_at;
      const storedStart = row.current_period_start;
      const periodChanged = !storedStart || new Date(storedStart).getTime() !== periodStart.getTime();

      // Class B / C — cancellation pending OR ordinary active.
      if (periodChanged) {
        // Period rollover. The refresh path inside
        // refreshSubscriptionPeriod re-checks terminal state and
        // the cancel_at_period_end flag (D-2 branch runs first
        // and finalises pending cancellations).
        await refreshSubscriptionPeriod({
          subscriptionId: existing.subscriptionId,
          periodStart,
          periodEnd,
          stripeEventId: stripeSubId,
        });
      } else if (wasPastDue) {
        // Recovery from past_due. markSubscriptionPaymentRecovered
        // (a) re-checks terminal state and (b) preserves
        // cancel_at_period_end when present. This is the Class B
        // "pending cancellation survives payment recovery" path.
        const { email, fullName } = await resolveStudentContact(existing.studentId);
        const locale = await resolveStudentLocale(existing.studentId);
        await markSubscriptionPaymentRecovered({
          subscriptionId: existing.subscriptionId,
          stripeEventId: stripeSubId,
          studentEmail: email,
          studentName: fullName,
          locale,
        });
      } else if (cancelAtPeriodEnd) {
        // Class B (or Class C re-affirming cancel_at_period_end).
        // No state change — the flag is already set on our side.
        // The period-refresh path at current_period_end
        // finalises the cancellation.
      }
      return;
    }

    if (status === 'canceled' || status === 'incomplete_expired') {
      const { email, fullName } = await resolveStudentContact(existing.studentId);
      const locale = await resolveStudentLocale(existing.studentId);
      await markSubscriptionSuspended({
        subscriptionId: existing.subscriptionId,
        stripeEventId: stripeSubId,
        reason: 'stripe_deleted',
        studentEmail: email,
        studentName: fullName,
        locale,
      });
      return;
    }

    // 'incomplete' / other transient states → noop (will be
    // re-delivered by Stripe when payment completes).
    logger.info('handleCustomerSubscriptionEvent: transient status, noop', {
      stripeSubId,
      status,
    });
  } catch (e) {
    logger.error('handleCustomerSubscriptionEvent failed', {
      ...describeError(e),
      stripeSubscriptionId: sub.id,
    });
    throw e;
  }
}

// =====================================================================
// customer.subscription.deleted
// =====================================================================

/** Final cancellation by Stripe (e.g. operator-initiated cancel
 *  via the Stripe Dashboard). Same as the `cancelled` branch
 *  above — finalised as suspended with reason `stripe_deleted`. */
export async function handleCustomerSubscriptionDeleted(
  sub: Stripe.Subscription,
): Promise<void> {
  try {
    const existing = await resolveSubscriptionByStripeId(sub.id);
    if (!existing) {
      logger.warn('handleCustomerSubscriptionDeleted: subscription row not found', {
        stripeSubscriptionId: sub.id,
      });
      return;
    }
    const { email, fullName } = await resolveStudentContact(existing.studentId);
    const locale = await resolveStudentLocale(existing.studentId);
    await markSubscriptionSuspended({
      subscriptionId: existing.subscriptionId,
      stripeEventId: sub.id,
      reason: 'stripe_deleted',
      studentEmail: email,
      studentName: fullName,
      locale,
    });
  } catch (e) {
    logger.error('handleCustomerSubscriptionDeleted failed', {
      ...describeError(e),
      stripeSubscriptionId: sub.id,
    });
    throw e;
  }
}

// =====================================================================
// invoice.payment_failed
// =====================================================================

/** Stripe reports an invoice payment failed. The canonical
 *  trigger for the past_due state. Maps to
 *  `markSubscriptionPastDue`. */
export async function handleInvoicePaymentFailed(
  inv: Stripe.Invoice,
): Promise<void> {
  try {
    const stripeSubId =
      typeof inv.subscription === 'string'
        ? inv.subscription
        : inv.subscription?.id ?? null;
    if (!stripeSubId) {
      logger.warn('handleInvoicePaymentFailed: invoice has no subscription id', {
        invoiceId: inv.id,
      });
      return;
    }
    const existing = await resolveSubscriptionByStripeId(stripeSubId);
    if (!existing) {
      logger.warn('handleInvoicePaymentFailed: subscription row not found', {
        stripeSubscriptionId: stripeSubId,
      });
      return;
    }
    const { email, fullName } = await resolveStudentContact(existing.studentId);
    const locale = await resolveStudentLocale(existing.studentId);
    const periodEnd = inv.period_end ? new Date(inv.period_end * 1000) : new Date();
    await markSubscriptionPastDue({
      subscriptionId: existing.subscriptionId,
      stripeEventId: inv.id ?? stripeSubId,
      failureReason: 'invoice.payment_failed',
      studentEmail: email,
      studentName: fullName,
      locale,
      periodEndIso: periodEnd.toISOString(),
    });
  } catch (e) {
    logger.error('handleInvoicePaymentFailed failed', {
      ...describeError(e),
      invoiceId: inv.id,
    });
    throw e;
  }
}

/**
 * Handle `invoice.payment_succeeded` (and forward-compat
 * `invoice.paid`).
 *
 * Why this exists (user-approved correction v2): some Stripe
 * accounts emit `invoice.payment_succeeded` WITHOUT a paired
 * `customer.subscription.updated` that flips status back to
 * `active`. If we only listen to the subscription-updated path,
 * the subscription can stay stuck in `past_due` (and the student
 * never gets the recovery email) even though Stripe charged the
 * card successfully. This handler closes that gap by routing
 * through the same terminal-state-guarded recovery path.
 *
 * The recovery function (`markSubscriptionPaymentRecovered`)
 * enforces three rules atomically:
 *   - If `cancelled_at IS NOT NULL OR status='cancelled'`:
 *     NO-OP (terminal — a stale success event on a cancelled
 *     subscription must not flip it back to active).
 *   - If `cancel_at_period_end=true`: recovery restores `active`
 *     and PRESERVES the flag (Class B behaviour — a pending
 *     cancellation survives payment recovery).
 *   - Otherwise: clear `past_due_at` + `grace_period_ends_at`,
 *     set `status='active'`.
 */
export async function handleInvoicePaymentSucceeded(
  inv: Stripe.Invoice,
): Promise<void> {
  try {
    const stripeSubId =
      typeof inv.subscription === 'string'
        ? inv.subscription
        : inv.subscription?.id ?? null;
    if (!stripeSubId) {
      logger.warn('handleInvoicePaymentSucceeded: invoice has no subscription id', {
        invoiceId: inv.id,
      });
      return;
    }
    const existing = await resolveSubscriptionByStripeId(stripeSubId);
    if (!existing) {
      logger.warn('handleInvoicePaymentSucceeded: subscription row not found', {
        stripeSubscriptionId: stripeSubId,
      });
      return;
    }

    const { email, fullName } = await resolveStudentContact(existing.studentId);
    const locale = await resolveStudentLocale(existing.studentId);

    // The terminal-state guard inside markSubscriptionPaymentRecovered
    // (read first → if terminal → return no_op_terminal → skip outbox,
    // email, and UPDATE) handles all three Class A / B / C branches
    // cleanly. We deliberately do NOT pre-screen the state here:
    // a single source of truth for "is this row recoverable?"
    // prevents drift between the customer.subscription.updated
    // path and this invoice.payment_succeeded path.
    const result = await markSubscriptionPaymentRecovered({
      subscriptionId: existing.subscriptionId,
      stripeEventId: inv.id ?? stripeSubId,
      studentEmail: email,
      studentName: fullName,
      locale,
    });

    if (result.kind === 'no_op_terminal') {
      logger.info('handleInvoicePaymentSucceeded: subscription is terminal, NO-OP', {
        stripeSubscriptionId: stripeSubId,
        subscriptionId: existing.subscriptionId,
        invoiceId: inv.id,
      });
    }
  } catch (e) {
    logger.error('handleInvoicePaymentSucceeded failed', {
      ...describeError(e),
      invoiceId: inv.id,
    });
    throw e;
  }
}

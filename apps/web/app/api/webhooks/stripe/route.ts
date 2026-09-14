import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/utils/api';
import { Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';
import { markSessionGrantPaid } from '@/services/curriculum/session-grants';
import {
  handleCustomerSubscriptionEvent,
  handleCustomerSubscriptionDeleted,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
} from '@/lib/stripe/subscription-event-handlers';

/**
 * Stripe inbound webhook.
 *
 * Verifies the `stripe-signature` header against the webhook secret,
 * records the event in `webhook_events` for idempotency, and applies
 * the relevant state change.
 *
 * Sprint 3.6: the v1 back-compat is REMOVED. The Stripe Checkout
 * Session metadata key is now `session_grant_id` only. The v1
 * `enrollments` and `_bookings_legacy` tables are dropped in
 * `20260715000000_drop_v1_back_compat_tables.sql`. The v1
 * `enrollment_id` / `booking_id` metadata keys are no longer
 * accepted — the route returns 200 with a warning log if a
 * payload arrives with only the v1 keys (the corresponding v1
 * rows no longer exist).
 */
export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) throw Unauthorized('Missing signature.');

    const secret = serverEnv().STRIPE_WEBHOOK_SECRET;
    if (!secret) throw Unauthorized('Webhook secret not configured.');

    const rawBody = await req.text();
    let event: Stripe.Event;

    try {
      event = stripe().webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      throw Unauthorized(`Invalid signature: ${(err as Error).message}`);
    }

    const admin = createSupabaseAdminClient();

    // Idempotency: write the event first. If it already exists, we are
    // replaying – return 200 without re-processing.
    const { error: insertError } = await admin
      .from('webhook_events')
      .insert({
        provider:   'stripe',
        event_id:   event.id,
        event_type: event.type,
        payload:    event as unknown as Record<string, unknown>,
      } as never);
    if (insertError) {
      // Postgres unique violation = duplicate event.
      if ((insertError as { code?: string }).code === '23505') {
        return NextResponse.json({ received: true, duplicate: true });
      }
      throw insertError;
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // Sprint 3.6: the v2 `session_grant_id` key is the
        // only accepted metadata key. The v1 `enrollment_id`
        // and `booking_id` keys are no longer routed (the
        // corresponding v1 tables are dropped in
        // `20260715000000_drop_v1_back_compat_tables.sql`).
        const sessionGrantId = (session.metadata?.session_grant_id ??
          session.client_reference_id) as string | undefined;

        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        if (!sessionGrantId) {
          // No v2 key — log a warning and 200 so Stripe does
          // not retry indefinitely. The v1 path is gone; the
          // payload is from a pre-Sprint-3.5 Stripe session
          // whose target table no longer exists.
          logger.warn('stripe.checkout.session.completed arrived without session_grant_id (v1 key?)', {
            event_id: event.id,
            has_enrollment_id: typeof session.metadata?.enrollment_id === 'string',
            has_booking_id: typeof session.metadata?.booking_id === 'string',
          });
          break;
        }
        // 1. Update the v2 `payments` row keyed by
        //    `session_grant_id`.
        await admin
          .from('payments')
          .update({
            status: 'succeeded',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: paymentIntentId,
            amount_cents: session.amount_total ?? 0,
          } as never)
          .eq('session_grant_id', sessionGrantId);
        // 2. Flip the session_grant to `active`. The
        //    `markSessionGrantPaid` service does this and
        //    also stamps `paid_at` and the Stripe ids.
        //    Sprint 5 (Slice A): this same path is used for
        //    Pack 10 pool rows (grant_type='pack') and
        //    Monthly Support subscription rows
        //    (grant_type='subscription', Slice C). The
        //    service is `grant_type`-agnostic.
        await markSessionGrantPaid(
          sessionGrantId,
          session.id,
          paymentIntentId ?? undefined,
        );
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await admin
          .from('payments')
          .update({ status: 'failed' } as never)
          .eq('stripe_payment_intent_id', pi.id);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        if (charge.payment_intent) {
          // 1. Update the payments row. The DB trigger
          //    `fn_enrollments_refund` (added in Sprint C
          //    migration `20260710000000_…`) cascades the
          //    flip to the linked enrollment. The same
          //    trigger cascades to `session_grants` via the
          //    `session_grant_id` FK (added in
          //    `…0003_session_bookings_meeting_links_payments.sql`).
          await admin
            .from('payments')
            .update({
              status: 'refunded',
              refunded_at: new Date().toISOString(),
              refunded_amount_cents: charge.amount_refunded,
            } as never)
            .eq('stripe_payment_intent_id', charge.payment_intent as string);
        }
        break;
      }
      // ---------------------------------------------------------
      // Feature C — Monthly Support recurring-billing lifecycle.
      // Wired in TASK 3 / Feature C. Delegates to
      // `lib/stripe/subscription-event-handlers.ts`. The four
      // events drive the state machine documented in
      // `docs/plans/TASK3_FEATURE_C_MONTHLY_SUPPORT.md` §1.1.
      // D-1: no session_grants mutation here — current-period
      // pool rows remain consumable until current_period_end.
      // D-4: idempotency via the existing n8n_executions UNIQUE
      // run_id primitive (reused from Pack refund).
      // D-6: Stripe's current_period_start / current_period_end
      // are authoritative — no 30-day computation here.
      // ---------------------------------------------------------
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await handleCustomerSubscriptionEvent(sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await handleCustomerSubscriptionDeleted(sub);
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription) {
          await handleInvoicePaymentFailed(inv);
        }
        break;
      }
      // TASK 3 correction v2 — close the recovery-gap left by the
      // customer.subscription.updated-only path. Some Stripe
      // accounts emit invoice.payment_succeeded WITHOUT a paired
      // subscription.updated that flips status back to active.
      // Without this handler, a subscription can stay stuck in
      // past_due even after Stripe charged the card successfully.
      // `invoice.paid` is the newer (forward-compat) event name.
      case 'invoice.payment_succeeded':
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription) {
          await handleInvoicePaymentSucceeded(inv);
        }
        break;
      }
      default:
        logger.info('Unhandled Stripe event', { type: event.type, id: event.id });
    }

    // Mark the event as processed.
    await admin
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() } as never)
      .eq('provider', 'stripe')
      .eq('event_id', event.id);

    return NextResponse.json({ received: true });
  } catch (e) { return errorResponse(e); }
}

// Stripe needs the raw body to verify the signature – Next.js
// must NOT parse it. The body parser is bypassed by `req.text()`.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

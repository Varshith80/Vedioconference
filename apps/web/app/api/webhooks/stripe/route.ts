import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/utils/api';
import { Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';
import { markSessionGrantPaid } from '@/services/curriculum/session-grants';

/**
 * Stripe inbound webhook.
 *
 * Verifies the `stripe-signature` header against the webhook secret,
 * records the event in `webhook_events` for idempotency, and applies
 * the relevant state change.
 *
 * Sprint 3.5: the unit of payment is now `session_grant` (not
 * `enrollment`). The Stripe Checkout Session metadata key is
 * `session_grant_id`. For one sprint we still accept the v1
 * `enrollment_id` key for the legacy rows; the v1 path is
 * dropped in Sprint 3.6.
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
        // Sprint 3.5: prefer the new `session_grant_id` key. Fall
        // back to the v1 `enrollment_id` for the legacy rows that
        // are still in flight (this transition window ends in
        // Sprint 3.6). The `client_reference_id` is the third
        // fallback (older C-phase code paths).
        const sessionGrantId = (session.metadata?.session_grant_id ??
          session.client_reference_id) as string | undefined;
        const legacyEnrollmentId = session.metadata?.enrollment_id as
          | string
          | undefined;
        const legacyBookingId = session.metadata?.booking_id as
          | string
          | undefined;

        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        if (sessionGrantId) {
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
          await markSessionGrantPaid(
            sessionGrantId,
            session.id,
            paymentIntentId ?? undefined,
          );
        } else if (legacyEnrollmentId) {
          // 1. Update the v1 `payments` row keyed by
          //    `enrollment_id`.
          await admin
            .from('payments')
            .update({
              status: 'succeeded',
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: paymentIntentId,
              amount_cents: session.amount_total ?? 0,
            } as never)
            .eq('enrollment_id', legacyEnrollmentId);
          // 2. Flip the v1 `enrollments` row to `active`.
          await admin
            .from('enrollments')
            .update({
              status: 'active',
              paid_at: new Date().toISOString(),
              stripe_session_id: session.id,
              stripe_payment_intent_id: paymentIntentId,
            } as never)
            .eq('id', legacyEnrollmentId);
        } else if (legacyBookingId) {
          await admin
            .from('payments')
            .update({
              status: 'succeeded',
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: paymentIntentId,
              amount_cents: session.amount_total ?? 0,
            } as never)
            .eq('booking_id', legacyBookingId);
        }
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

import { NextResponse, type NextRequest } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest, Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

/**
 * Stripe inbound webhook.
 *
 * Verifies the `stripe-signature` header against the webhook secret,
 * records the event in `webhook_events` for idempotency, and applies
 * the relevant state change.
 */
export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) throw Unauthorized('Missing signature.');

    const secret = process.env.STRIPE_WEBHOOK_SECRET;
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
      });
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
        const bookingId = (session.metadata?.booking_id ?? session.client_reference_id) as string | undefined;
        if (bookingId) {
          await admin.from('payments')
            .update({
              status: 'succeeded',
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id ?? null,
              amount_cents: session.amount_total ?? 0,
            })
            .eq('booking_id', bookingId);
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await admin.from('payments')
          .update({ status: 'failed' })
          .eq('stripe_payment_intent_id', pi.id);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        if (charge.payment_intent) {
          await admin.from('payments')
            .update({
              status: 'refunded',
              refunded_at: new Date().toISOString(),
              refunded_amount_cents: charge.amount_refunded,
            })
            .eq('stripe_payment_intent_id', charge.payment_intent as string);
        }
        break;
      }
      default:
        logger.info('Unhandled Stripe event', { type: event.type, id: event.id });
    }

    // Mark the event as processed.
    await admin.from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('provider', 'stripe')
      .eq('event_id', event.id);

    return NextResponse.json({ received: true });
  } catch (e) { return errorResponse(e); }
}

// Stripe needs the raw body to verify the signature – Next.js
// must NOT parse it. The body parser is bypassed by `req.text()`.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

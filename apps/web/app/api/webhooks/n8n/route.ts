import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest, Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';

/**
 * Generic inbound webhook for n8n.
 * Validates a shared secret, records the event in `webhook_events`
 * for idempotency, then updates the relevant Supabase row.
 *
 * Sprint 3.6 changes:
 *   - The v1 back-compat for `module_booking_id` (v1
 *     `module_bookings` table) and `booking_id` (legacy
 *     `_bookings_legacy` table) is REMOVED. The v1 tables are
 *     dropped in `20260715000000_drop_v1_back_compat_tables.sql`.
 *     The v1 `enrollments` table is also gone. The v2
 *     equivalents are: `session_booking_id` (for
 *     `session_bookings`) and `session_grant_id` (for
 *     `session_grants`).
 *   - The `enrollment_checkout_created` and
 *     `enrollment_refund_succeeded` cases are REMOVED (the
 *     v1 `enrollments` table is gone). The v2 equivalents are
 *     `session_grant_checkout_created` and
 *     `session_grant_refund_succeeded`.
 *   - Supported payloads (v2 only):
 *       { type: "meeting_created",                  session_booking_id, meeting_id, ... }
 *       { type: "payment_succeeded",                payment_id, ... }
 *       { type: "payment_failed",                   payment_id }
 *       { type: "reminder_sent",                    session_booking_id, channel, type }
 *       { type: "session_grant_checkout_created",   session_grant_id, stripe_session_id }
 *       { type: "session_booking_confirmed",        session_booking_id }
 *       { type: "session_booking_cancelled",        session_booking_id }
 *       { type: "session_grant_refund_succeeded",   session_grant_id }
 *       { type: "workflow_failed",                  workflow, error, original_event }
 */
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== serverEnv().N8N_WEBHOOK_SECRET) throw Unauthorized('Invalid webhook secret.');

    const body = await req.json();
    if (!body?.type) throw BadRequest('Missing event type.');

    const admin = createSupabaseAdminClient();

    // Idempotency for non-business events (workflow_failed etc.) – for
    // business events (meeting_created etc.) we trust n8n's own
    // idempotency keys.
    if (body.event_id) {
      const { error: insertError } = await admin.from('webhook_events').insert({
        provider: 'n8n',
        event_id: String(body.event_id),
        event_type: body.type,
        payload: body,
      } as never);
      if (insertError && (insertError as { code?: string }).code === '23505') {
        return NextResponse.json({ received: true, duplicate: true });
      }
    }

    switch (body.type) {
      case 'meeting_created': {
        const {
          session_booking_id,
          meeting_id,
          join_url,
          passcode,
          host_url,
          start_url,
        } = body;
        if (!session_booking_id) {
          throw BadRequest('meeting_created requires session_booking_id.');
        }
        const { error } = await admin.from('meeting_links').upsert({
          session_booking_id,
          provider: 'zoom',
          meeting_id,
          join_url,
          passcode,
          host_url,
          start_url,
        } as never, { onConflict: 'session_booking_id' });
        if (error) throw error;

        await admin
          .from('session_bookings')
          .update({ status: 'confirmed' } as never)
          .eq('id', session_booking_id);
        break;
      }
      case 'session_grant_checkout_created': {
        // Sprint 3.5: n8n created the Stripe Checkout Session
        // for a v2 `session_grant`. Persist the Stripe session
        // id so the `checkout.session.completed` webhook (and
        // the resume endpoint) can resolve the grant back to
        // the session.
        const { session_grant_id, stripe_session_id } = body;
        if (!session_grant_id || !stripe_session_id) {
          throw BadRequest(
            'session_grant_checkout_created requires session_grant_id and stripe_session_id.',
          );
        }
        await admin
          .from('session_grants')
          .update({
            stripe_session_id,
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', session_grant_id);
        break;
      }
      case 'session_grant_refund_succeeded': {
        // Sprint 3.5: n8n performed the Stripe refund for a
        // v2 `session_grant`. The payments row + the linked
        // session_grant row have been updated by the
        // `charge.refunded` webhook + the
        // `fn_enrollments_refund` trigger (the trigger was
        // widened in `…0003_…` to also flip
        // `session_grants.status` to `refunded`). This branch
        // exists for observability.
        const { session_grant_id } = body;
        if (!session_grant_id) break;
        const { data: grant } = await admin
          .from('session_grants')
          .select('student_id')
          .eq('id', session_grant_id)
          .single();
        const grantRow = grant as unknown as { student_id: string } | null;
        if (grantRow) {
          await admin.from('notifications').insert({
            user_id: grantRow.student_id,
            type:    'session_grant_refund_succeeded',
            channel: 'email',
            payload: body,
          } as never);
        }
        break;
      }
      case 'session_booking_confirmed': {
        // Sprint 3.5: Zoom meeting created. Flip the
        // `session_bookings.status` to `confirmed` and the
        // `session_grants.status` to `active` if the grant
        // is still `pending_payment` (the meeting is
        // happening).
        const { session_booking_id } = body;
        if (!session_booking_id) break;
        await admin
          .from('session_bookings')
          .update({
            status: 'confirmed',
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', session_booking_id);
        const { data: booking } = await admin
          .from('session_bookings')
          .select('session_grant_id')
          .eq('id', session_booking_id)
          .maybeSingle();
        const bookingRow = booking as unknown as { session_grant_id: string } | null;
        if (bookingRow?.session_grant_id) {
          await admin
            .from('session_grants')
            .update({ status: 'active' } as never)
            .eq('id', bookingRow.session_grant_id)
            .eq('status', 'pending_payment');
        }
        break;
      }
      case 'session_booking_cancelled': {
        // Sprint 3.5: student/tutor/admin cancelled a
        // booking. Flip the booking to `cancelled`. The
        // linked `session_grant` keeps its current status
        // (it is a separate concept; cancelling one
        // booking does not invalidate the grant).
        const { session_booking_id } = body;
        if (!session_booking_id) break;
        await admin
          .from('session_bookings')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', session_booking_id);
        break;
      }
      case 'payment_succeeded': {
        const { payment_id, stripe_payment_intent_id, amount_cents, stripe_receipt_url } = body;
        const { error } = await admin.from('payments').update({
          status: 'succeeded', paid_at: new Date().toISOString(),
          stripe_payment_intent_id, stripe_receipt_url, amount_cents,
        } as never).eq('id', payment_id);
        if (error) throw error;
        break;
      }
      case 'payment_failed': {
        const { payment_id } = body;
        const { error } = await admin.from('payments').update({ status: 'failed' } as never).eq('id', payment_id);
        if (error) throw error;
        break;
      }
      case 'reminder_sent': {
        const {
          session_booking_id,
          channel = 'email',
          type = 'reminder_24h',
        } = body;
        if (!session_booking_id) {
          throw BadRequest('reminder_sent requires session_booking_id.');
        }
        const { data: sb } = await admin
          .from('session_bookings')
          .select('student_id')
          .eq('id', session_booking_id)
          .single();
        const userId = (sb as { student_id?: string } | null)?.student_id ?? null;
        if (userId) {
          await admin.from('notifications').insert({
            user_id: userId,
            type,
            channel,
            payload: body,
          } as never);
        }
        break;
      }
      case 'workflow_failed': {
        const { workflow, error, original_event } = body;
        await admin.from('n8n_dead_letters').insert({
          workflow: workflow ?? 'unknown',
          original_event: original_event ?? {},
          error: error ?? 'unknown',
        } as never);
        break;
      }
      default:
        logger.warn('Unknown n8n webhook event type', { type: body.type });
    }

    return NextResponse.json({ received: true });
  } catch (e) { return errorResponse(e); }
}

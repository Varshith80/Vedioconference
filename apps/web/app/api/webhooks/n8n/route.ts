import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest, Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

/**
 * Generic inbound webhook for n8n.
 * Validates a shared secret, records the event in `webhook_events`
 * for idempotency, then updates the relevant Supabase row.
 *
 * Expected payloads (one endpoint, multiple `type`s):
 *   { type: "meeting_created",   booking_id, ... }
 *   { type: "payment_succeeded", payment_id, ... }
 *   { type: "payment_failed",    payment_id, ... }
 *   { type: "reminder_sent",     booking_id, channel }
 *   { type: "workflow_failed",   workflow, error, original_event }
 */
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== process.env.N8N_WEBHOOK_SECRET) throw Unauthorized('Invalid webhook secret.');

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
        const { booking_id, meeting_id, join_url, passcode, host_url, start_url } = body;
        const { error } = await admin.from('meeting_links').upsert({
          booking_id, provider: 'zoom', meeting_id, join_url, passcode, host_url, start_url,
        } as never, { onConflict: 'booking_id' });
        if (error) throw error;
        await admin.from('bookings').update({ status: 'confirmed' } as never).eq('id', booking_id);
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
        const { booking_id, channel = 'email', type = 'reminder_24h' } = body;
        const { data: booking } = await admin
          .from('bookings').select('student_id').eq('id', booking_id).single();
        const studentId = (booking as { student_id?: string } | null)?.student_id;
        if (studentId) {
          await admin.from('notifications').insert({
            user_id: studentId,
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

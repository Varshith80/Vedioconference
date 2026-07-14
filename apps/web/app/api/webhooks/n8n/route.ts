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
 * Sprint B2 expected payloads (one endpoint, multiple `type`s):
 *   { type: "meeting_created",   module_booking_id, meeting_id, ... }
 *   { type: "meeting_created",   booking_id,        ... }   (legacy)
 *   { type: "payment_succeeded", payment_id,        ... }
 *   { type: "payment_failed",    payment_id,        ... }
 *   { type: "reminder_sent",     module_booking_id, channel, type }
 *   { type: "reminder_sent",     booking_id,        channel, type }   (legacy)
 *   { type: "workflow_failed",   workflow, error, original_event }
 *
 * Sprint 3.5 added payloads (v2 path; n8n workflow filenames
 * unchanged, only field names renamed — see `n8n/docs/WORKFLOWS.md`):
 *   { type: "meeting_created",          session_booking_id, meeting_id, ... }
 *   { type: "reminder_sent",            session_booking_id, channel, type }
 *   { type: "session_grant_checkout_created", session_grant_id, stripe_session_id }
 *   { type: "session_booking_confirmed",      session_booking_id }
 *   { type: "session_booking_cancelled",      session_booking_id }
 *   { type: "session_grant_refund_succeeded",  session_grant_id }
 *
 * The handler is forward-and-backward compatible: a v2 payload
 * with `session_booking_id` is preferred; a v1 payload with
 * `module_booking_id` continues to work for the deprecation
 * window (Sprint 3.6).
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
          module_booking_id,
          booking_id,
          session_booking_id,
          meeting_id,
          join_url,
          passcode,
          host_url,
          start_url,
        } = body;
        // Sprint 3.5: the v2 `session_booking_id` key is
        // preferred. Fall back to the v1 `module_booking_id`,
        // then the legacy `booking_id`.
        const id = session_booking_id ?? module_booking_id ?? booking_id;
        if (!id) {
          throw BadRequest('meeting_created requires session_booking_id, module_booking_id or booking_id.');
        }
        const onConflict = session_booking_id
          ? 'session_booking_id'
          : module_booking_id
            ? 'module_booking_id'
            : 'booking_id';
        const { error } = await admin.from('meeting_links').upsert({
          ...(session_booking_id
            ? { session_booking_id }
            : module_booking_id
              ? { module_booking_id }
              : { booking_id }),
          provider: 'zoom',
          meeting_id,
          join_url,
          passcode,
          host_url,
          start_url,
        } as never, { onConflict });
        if (error) throw error;

        if (session_booking_id) {
          await admin
            .from('session_bookings')
            .update({ status: 'confirmed' } as never)
            .eq('id', session_booking_id);
        } else if (module_booking_id) {
          await admin
            .from('module_bookings')
            .update({ status: 'confirmed' } as never)
            .eq('id', module_booking_id);
        } else {
          // Legacy path: write to _bookings_legacy if a row
          // still exists. Best-effort; missing row is OK.
          await admin
            .from('_bookings_legacy')
            .update({ status: 'confirmed' } as never)
            .eq('id', booking_id);
        }
        break;
      }
      case 'enrollment_checkout_created': {
        // Sprint C: n8n created the Stripe Checkout Session.
        // Persist the session id on the enrollment row so the
        // `checkout.session.completed` webhook can resolve the
        // enrollment back to the session.
        const { enrollment_id, stripe_session_id } = body;
        if (!enrollment_id || !stripe_session_id) {
          throw BadRequest('enrollment_checkout_created requires enrollment_id and stripe_session_id.');
        }
        await admin
          .from('enrollments')
          .update({ stripe_session_id } as never)
          .eq('id', enrollment_id);
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
      case 'enrollment_refund_succeeded': {
        // Sprint C: n8n performed the Stripe refund. The
        // payments row + the linked enrollments row have been
        // updated by the `charge.refunded` webhook + the
        // `fn_enrollments_refund` trigger. This branch exists
        // for observability (a `notifications` row) and is
        // safe to receive out-of-order.
        const { enrollment_id } = body;
        if (!enrollment_id) break;
        const { data: enrollment } = await admin
          .from('enrollments')
          .select('student_id')
          .eq('id', enrollment_id)
          .single();
        const enrollmentRow = enrollment as unknown as { student_id: string } | null;
        if (enrollmentRow) {
          await admin.from('notifications').insert({
            user_id: enrollmentRow.student_id,
            type:    'enrollment_refund_succeeded',
            channel: 'email',
            payload: body,
          } as never);
        }
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
          module_booking_id,
          booking_id,
          session_booking_id,
          channel = 'email',
          type = 'reminder_24h',
        } = body;
        let userId: string | null = null;
        if (session_booking_id) {
          const { data: sb } = await admin
            .from('session_bookings')
            .select('student_id')
            .eq('id', session_booking_id)
            .single();
          userId = (sb as { student_id?: string } | null)?.student_id ?? null;
        } else if (module_booking_id) {
          const { data: mb } = await admin
            .from('module_bookings')
            .select('student_id')
            .eq('id', module_booking_id)
            .single();
          userId = (mb as { student_id?: string } | null)?.student_id ?? null;
        } else {
          const { data: b } = await admin
            .from('_bookings_legacy')
            .select('student_id')
            .eq('id', booking_id)
            .single();
          userId = (b as { student_id?: string } | null)?.student_id ?? null;
        }
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

import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest, Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';

/**
 * Calendly inbound webhook.
 *
 * Calendly signs every webhook with `Calendly-Webhook-Signature`,
 * value of the form: `t=<unix>,v1=<hex>`.
 */
export async function POST(req: NextRequest) {
  try {
    const sigHeader = req.headers.get('calendly-webhook-signature');
    if (!sigHeader) throw Unauthorized('Missing signature.');

    const key = serverEnv().CALENDLY_WEBHOOK_SIGNING_KEY;
    if (!key) throw Unauthorized('Webhook signing key not configured.');

    const raw = await req.text();

    // Parse the signature header
    const parts: Record<string, string> = {};
    for (const p of sigHeader.split(',')) {
      const [k, v] = p.split('=');
      if (k && v) parts[k.trim()] = v;
    }
    const t = parts.t;
    const v1 = parts.v1;
    if (!t || !v1) throw Unauthorized('Malformed signature.');

    const expected = createHmac('sha256', key).update(`${t}.${raw}`).digest('hex');
    const a = Buffer.from(v1, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw Unauthorized('Invalid signature.');
    }

    const body = JSON.parse(raw) as { event?: string; payload?: Record<string, unknown> };
    if (!body.event || !body.payload) throw BadRequest('Missing event/payload.');

    const admin = createSupabaseAdminClient();
    const eventId = `${body.event}-${(body.payload as { uri?: string }).uri ?? Date.now()}`;

    const { error: insertError } = await admin.from('webhook_events').insert({
      provider: 'calendly',
      event_id: eventId,
      event_type: body.event,
      payload: body as unknown as Record<string, unknown>,
    } as never);
    if (insertError && (insertError as { code?: string }).code === '23505') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (insertError) throw insertError;

    // Calendly events are also handled by the n8n pipeline. Here we
    // just record them in the audit log for traceability.
    logger.info('Calendly webhook received', { event: body.event, eventId });

    await admin.from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() } as never)
      .eq('provider', 'calendly')
      .eq('event_id', eventId);

    return NextResponse.json({ received: true });
  } catch (e) { return errorResponse(e); }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

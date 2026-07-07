import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/services/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest, Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

const cancelSchema = z.object({ reason: z.string().max(500).optional() });

/** POST /api/bookings/[id]/cancel – cancel a confirmed booking. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) throw Unauthorized();
    const { reason } = cancelSchema.parse(await req.json().catch(() => ({})));

    const supabase = createSupabaseServerClient();
    // Fetch first so we can apply the business rule and the trigger check.
    const { data: existing, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', params.id)
      .eq('student_id', user.id)
      .single();
    if (fetchError || !existing) throw BadRequest('Réservation introuvable ou non autorisée.');

    // Business rule: students can cancel until 1h before the start.
    // After that, only an admin can.
    const start = new Date(existing.scheduled_start).getTime();
    const now   = Date.now();
    if (now > start - 60 * 60 * 1000) {
      throw BadRequest('La fenêtre d\'annulation est dépassée. Contactez le support.');
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        status:           'cancelled',
        cancelled_at:     new Date().toISOString(),
        cancelled_reason: reason ?? null,
      })
      .eq('id', params.id)
      .eq('student_id', user.id)
      .select('*')
      .single();

    if (error || !booking) throw BadRequest('Annulation impossible.');

    // Fire the cancellation workflow (Stripe refund + Zoom delete + email)
    await fetch(`${process.env.N8N_BASE_URL}/webhook/booking-cancelled`, {
      method:  'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-Webhook-Secret': process.env.N8N_WEBHOOK_SECRET ?? '',
        'X-Request-Id':     req.headers.get('x-request-id') ?? '',
      },
      body: JSON.stringify({ booking_id: booking.id }),
    });

    logger.info('Booking cancelled', { bookingId: booking.id, userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}

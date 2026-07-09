import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, NotFound, Unauthorized } from '@/lib/utils/errors';

/**
 * POST /api/module-bookings/[id]/cancel — cancel a single
 * scheduled module booking. Sprint B2: cancellation is
 * per-module, not per-course. The trigger
 * `fn_block_late_cancel` rejects cancellations less than one
 * hour before `scheduled_start` (the policy lives in Postgres,
 * not in this route, so the DB is the source of truth).
 */
const bodySchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;

  const supabase = await createSupabaseServerClientUntyped();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw Unauthorized('You must be signed in to cancel a booking.');

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
  }

  const { data: booking, error: readError } = await supabase
    .from('module_bookings')
    .select('id, student_id, status, scheduled_start')
    .eq('id', bookingId)
    .single();
  const bookingRow = booking as unknown as { id: string; student_id: string; status: string; scheduled_start: string } | null;
  if (readError || !bookingRow) {
    throw NotFound('Module booking not found.');
  }
  if (bookingRow.student_id !== user.id) {
    throw new ApiError(403, 'not_owner', 'This booking does not belong to you.');
  }
  if (bookingRow.status === 'cancelled') {
    return jsonResponse({ ok: true as const, data: { booking_id: bookingId, status: 'cancelled' } });
  }
  if (bookingRow.status === 'completed') {
    throw new ApiError(409, 'already_completed', 'This booking is already completed and cannot be cancelled.');
  }

  // The `fn_block_late_cancel` BEFORE-trigger throws
  // `late_cancel_blocked` if the booking is less than 60
  // minutes away. We surface the error code in the response.
  const { error: updateError } = await supabase
    .from('module_bookings')
    .update({ status: 'cancelled', cancel_reason: parsed.data.reason ?? null } as never)
    .eq('id', bookingId);
  if (updateError) {
    throw new ApiError(409, 'cancel_failed', 'Could not cancel this booking.', { reason: updateError.message });
  }

  return jsonResponse({ ok: true as const, data: { booking_id: bookingId, status: 'cancelled' } });
}

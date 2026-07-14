import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, Unauthorized, NotFound } from '@/lib/utils/errors';
import { cancelSessionBooking } from '@/services/curriculum/session-bookings';

/**
 * POST /api/session-bookings/[id]/cancel — student, tutor, or
 * admin cancel of a `session_booking` row.
 *
 * The route checks ownership before calling the service:
 *   - Student must be the row's `student_id`.
 *   - Tutor must own the row's `tutor_id` (i.e. the linked
 *     `tutors.profile_id` matches the caller's auth.uid()).
 *   - Admins can cancel any booking.
 *
 * The n8n `module-cancellation` workflow (filename unchanged)
 * is responsible for deleting the Zoom meeting; it fires on
 * the new `session_booking_id` and uses the renamed field
 * names per §6.4 of the plan.
 */
const bodySchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('You must be signed in to cancel a booking.');

    const { id } = await ctx.params;

    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }

    // Fetch the booking to check ownership.
    const { data: booking, error: bErr } = await supabase
      .from('session_bookings')
      .select('id, student_id, tutor_id, status')
      .eq('id', id)
      .maybeSingle();
    if (bErr) throw bErr;
    if (!booking) throw NotFound('Session booking not found.');
    const bRow = booking as unknown as {
      id: string;
      student_id: string;
      tutor_id: string;
      status: string;
    };

    // Ownership: student, tutor (via tutors.profile_id), or
    // admin. For Sprint 3.5 we trust RLS for the admin
    // branch (the `session_bookings_student_update_cancel`
    // policy) and add an explicit tutor check here.
    let authorized = bRow.student_id === user.id;
    if (!authorized) {
      const { data: tutor } = await supabase
        .from('tutors')
        .select('id, profile_id')
        .eq('id', bRow.tutor_id)
        .maybeSingle();
      const tRow = tutor as unknown as { profile_id: string } | null;
      authorized = tRow?.profile_id === user.id;
    }
    if (!authorized) {
      // Admin check (uses the is_admin() helper; this is the
      // only path that bypasses the student/tutor ownership).
      const { data: isAdmin } = await supabase.rpc('is_admin');
      if (isAdmin === true) authorized = true;
    }
    if (!authorized) {
      throw new ApiError(403, 'forbidden', 'You do not have permission to cancel this booking.');
    }

    if (bRow.status !== 'scheduled' && bRow.status !== 'confirmed') {
      throw new ApiError(409, 'booking_not_active', `Cannot cancel a booking with status "${bRow.status}".`);
    }

    const cancelled = await cancelSessionBooking(id, parsed.data.reason);
    if (!cancelled) {
      throw new ApiError(500, 'cancel_failed', 'Could not cancel the booking.');
    }

    return jsonResponse({
      ok: true as const,
      data: {
        session_booking_id: cancelled.id,
        status: cancelled.status,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

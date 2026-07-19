import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, Unauthorized, NotFound } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { cancelSessionBooking } from '@/services/curriculum/session-bookings';

/**
 * POST /api/session-bookings/[id]/cancel — student or admin
 * cancel of a `session_booking` row.
 *
 * The route checks ownership before calling the service:
 *   - Student must be the row's `student_id`.
 *   - Admins can cancel any booking.
 *
 * Sprint 3.8 — Tutors are standalone reference records (no
 * `profile_id`, no auth account). A tutor cannot self-cancel a
 * booking through this endpoint; if the admin wants to cancel
 * on a tutor's behalf they use the admin branch.
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

    // Ownership: student, or admin (via requireAdminRoute()).
    // Sprint 3.8 — tutors are standalone (no profile_id), so
    // there is no tutor-self-cancel branch in the MVP.
    let authorized = bRow.student_id === user.id;
    if (!authorized) {
      // Admin check: the shared requireAdminRoute() throws
      // Forbidden() for non-admins. We catch that and treat
      // it as "not authorized" so the unified 403 below fires.
      try {
        await requireAdminRoute();
        authorized = true;
      } catch {
        authorized = false;
      }
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

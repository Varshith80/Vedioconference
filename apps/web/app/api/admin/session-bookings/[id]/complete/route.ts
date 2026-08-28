import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';
import { manualCompleteSessionBooking } from '@/services/curriculum/session-bookings';

// =====================================================================
// Sprint 8 — B-19 POST /api/admin/session-bookings/[id]/complete.
//
// Admin-only. Transitions a session booking to `completed` from
// any non-terminal status. Used by the back-office "manual
// complete" button when Calendly / n8n never confirmed the
// session (network blip, tutor forgot to click "end", etc.).
//
// HTTP shape:
//   200 → { ok, data: { booking, transitioned: true } }
//   200 → { ok, data: { booking, transitioned: false } }   ← already completed
//   404 → no such booking
//   409 → booking is in a terminal non-completed state
//   (cancelled / no_show / rescheduled) — admin cannot rewrite
//   history silently
// =====================================================================

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireAdminRoute();
    const { id } = await params;

    const result = await manualCompleteSessionBooking(id, supabase);
    if (result.kind === 'not_found') {
      throw new ApiError(404, 'session_booking_not_found', 'Session booking not found.');
    }
    if (result.kind === 'already_terminal') {
      throw new ApiError(
        409,
        'session_booking_terminal',
        `Cannot manual-complete a booking in status '${result.booking.status}'.`,
        { status: result.booking.status },
      );
    }
    return jsonResponse({
      ok: true as const,
      data: { booking: result.booking, transitioned: true },
    });
  } catch (e) {
    logger.error('manual-complete session booking failed', { error: String(e) });
    return errorResponse(e);
  }
}
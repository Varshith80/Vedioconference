import { type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/utils/api';
import { ApiError, Unauthorized } from '@/lib/utils/errors';

/**
 * POST /api/enrollments/[id]/modules — DEPRECATED since Sprint
 * 3.5. The `module_bookings` table has been replaced by
 * `session_bookings` and the `enrollments` table is no longer
 * the unit of payment.
 *
 * Replacement: `POST /api/session-bookings` with
 * `{ session_id, session_grant_id, scheduled_start, scheduled_end }`.
 * Kept for one sprint as a 410 stub (removed in Sprint 3.6).
 */
export async function POST(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  const { createSupabaseServerClientUntyped } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClientUntyped();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw Unauthorized('You must be signed in.');
  return errorResponse(
    new ApiError(
      410,
      'endpoint_deprecated',
      'The /api/enrollments/[id]/modules endpoint has been replaced by /api/session-bookings in Sprint 3.5.',
      { replacement: 'POST /api/session-bookings' },
    ),
  );
}

import { type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/utils/api';
import { ApiError, Unauthorized } from '@/lib/utils/errors';

/**
 * POST /api/module-bookings — DEPRECATED since Sprint 3.5.
 * The `module_bookings` table is replaced by `session_bookings`.
 *
 * Replacement: `POST /api/session-bookings` with
 * `{ session_id, session_grant_id, scheduled_start, scheduled_end }`.
 * Kept for one sprint as a 410 stub (removed in Sprint 3.6).
 */
export async function POST(_req: NextRequest) {
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
      'The /api/module-bookings endpoint has been replaced by /api/session-bookings in Sprint 3.5.',
      { replacement: 'POST /api/session-bookings' },
    ),
  );
}

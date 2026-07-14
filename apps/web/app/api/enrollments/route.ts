import { type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/utils/api';
import { ApiError, Unauthorized } from '@/lib/utils/errors';

/**
 * POST /api/enrollments — DEPRECATED since Sprint 3.5. The
 * `enrollments` table is no longer the unit of payment; the
 * new unit is `session_grants`. The replacement endpoint is
 * `POST /api/session-grants` (Sprint 3.5).
 *
 * This route is kept for one sprint (Sprint 3.5) and returns
 * `410 Gone` with a pointer to the new path so any cached
 * client link surfaces the deprecation. The route files are
 * removed in Sprint 3.6.
 */
export async function POST(_req: NextRequest) {
  // Auth is still validated so the 410 surfaces only to
  // authenticated callers (avoids leaking endpoint metadata
  // to unauthenticated probers).
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
      'The /api/enrollments endpoint has been replaced by /api/session-grants in Sprint 3.5.',
      { replacement: 'POST /api/session-grants', body: { session_id: '<uuid>' } },
    ),
  );
}


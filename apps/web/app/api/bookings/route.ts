import { type NextRequest, type NextResponse } from 'next/server';
import { errorResponse } from '@/lib/utils/api';
import { ApiError } from '@/lib/utils/errors';

/**
 * GET /api/bookings – DEPRECATED in Sprint B2, retired in
 * Sprint 3.6.
 *
 * The unit of a booking was the v1 `module_bookings` row
 * (one Zoom meeting per module). The v1 hierarchy is dropped
 * in
 * `20260715000000_drop_v1_back_compat_tables.sql`. The v2
 * unit of a booking is the `session_booking` (one Zoom
 * meeting per session).
 *
 * This endpoint returns `410 Gone` with the v2 endpoint so
 * any stale client link is caught and redirected, not 404'd.
 * See `docs/api/API.md` §2.7.
 */
export async function GET(_req: NextRequest) {
  return gone('GET /api/session-bookings');
}

function gone(newEndpoint: string): NextResponse {
  return errorResponse(
    new ApiError(410, 'endpoint_removed',
      'This endpoint has been removed.', { new_endpoint: newEndpoint }),
  );
}

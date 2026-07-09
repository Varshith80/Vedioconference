import { type NextRequest, type NextResponse } from 'next/server';
import { errorResponse } from '@/lib/utils/api';
import { ApiError } from '@/lib/utils/errors';

/**
 * GET /api/bookings – DEPRECATED in Sprint B2.
 *
 * The unit of a booking is now a *module booking* (one Zoom
 * meeting per module). The unit of payment is the *enrollment*
 * (one Stripe charge per course). The legacy `bookings` table
 * has been renamed to `_bookings_legacy` (RLS off) and is
 * scheduled for deletion in a later cleanup migration.
 *
 * This endpoint returns `410 Gone` with the new endpoint so any
 * stale client link is caught and redirected, not 404'd. See
 * `docs/api/API.md` §2.7.
 */
export async function GET(_req: NextRequest) {
  return gone('GET /api/module-bookings');
}

function gone(newEndpoint: string): NextResponse {
  return errorResponse(
    new ApiError(410, 'endpoint_removed',
      'This endpoint has been removed in Sprint B2.', { new_endpoint: newEndpoint }),
  );
}

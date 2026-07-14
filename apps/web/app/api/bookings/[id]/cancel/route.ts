import { type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/utils/api';
import { ApiError } from '@/lib/utils/errors';

/**
 * POST /api/bookings/[id]/cancel – DEPRECATED in Sprint B2,
 * retired in Sprint 3.6.
 *
 * Cancellation is now per-session-booking. The v2 endpoint is
 * `POST /api/session-bookings/[id]/cancel`. The v1 hierarchy
 * (`module_bookings`, `module_progress`, `enrollments`,
 * `modules`) is dropped in
 * `20260715000000_drop_v1_back_compat_tables.sql`. Refunds
 * are admin-driven via
 * `POST /api/session-grants/[id]/refund`.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  void params;
  return errorResponse(
    new ApiError(410, 'endpoint_removed',
      'This endpoint has been removed.', { new_endpoint: '/api/session-bookings/[id]/cancel' }),
  );
}

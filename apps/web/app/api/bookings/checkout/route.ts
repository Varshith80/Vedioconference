import { type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/utils/api';
import { ApiError } from '@/lib/utils/errors';

/**
 * POST /api/bookings/checkout – DEPRECATED in Sprint B2, retired
 * in Sprint 3.6.
 *
 * The legacy per-booking Stripe Checkout Session endpoint was
 * replaced in Sprint B2 by `POST /api/enrollments` (the v1
 * course-level checkout). The v1 hierarchy is dropped in
 * Sprint 3.6 (migration
 * `20260715000000_drop_v1_back_compat_tables.sql`). The v2
 * unit of payment is the `session_grant`; the v2 checkout
 * lives in
 * `POST /api/session-grants/[id]/stripe-session` and the v2
 * checkout page at `/[locale]/checkout/session-grant/[id]`.
 */
export async function POST(_req: NextRequest) {
  return errorResponse(
    new ApiError(410, 'endpoint_removed',
      'This endpoint has been removed.', { new_endpoint: '/api/session-grants/[id]/stripe-session' }),
  );
}

import { type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/utils/api';
import { ApiError } from '@/lib/utils/errors';

/**
 * POST /api/bookings/checkout – DEPRECATED in Sprint B2.
 *
 * Payment is now course-level. The legacy per-booking Stripe
 * Checkout Session endpoint has been replaced by
 * `POST /api/enrollments`, which creates a Stripe Checkout
 * Session for a single (student, course) enrollment.
 */
export async function POST(_req: NextRequest) {
  return errorResponse(
    new ApiError(410, 'endpoint_removed',
      'This endpoint has been removed in Sprint B2.', { new_endpoint: '/api/enrollments' }),
  );
}

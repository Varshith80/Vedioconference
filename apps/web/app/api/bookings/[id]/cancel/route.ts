import { type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/utils/api';
import { ApiError } from '@/lib/utils/errors';

/**
 * POST /api/bookings/[id]/cancel – DEPRECATED in Sprint B2.
 *
 * Cancellation is now per-module-booking. The new endpoint is
 * `POST /api/module-bookings/[id]/cancel`. Refunds are
 * course-level and are admin-driven via
 * `POST /api/admin/enrollments/[id]/refund`.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  void params;
  return errorResponse(
    new ApiError(410, 'endpoint_removed',
      'This endpoint has been removed in Sprint B2.', { new_endpoint: '/api/module-bookings/[id]/cancel' }),
  );
}

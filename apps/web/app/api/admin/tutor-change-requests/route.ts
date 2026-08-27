import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { BadRequest, describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { getAllRequests } from '@/services/admin/tutor-change';
import type { TutorChangeRequestStatus } from '@/services/student/tutor-change';

// =====================================================================
// Sprint 6 — Admin GET /api/admin/tutor-change-requests
//
// Lists every tutor-change request, newest first. Admin-only.
// Optional `?status=pending` query param filters by status.
// =====================================================================

const ALLOWED_STATUSES: ReadonlyArray<TutorChangeRequestStatus> = [
  'pending',
  'alternatives_proposed',
  'student_selected',
  'completed',
  'cancelled',
];

export async function GET(req: NextRequest) {
  try {
    await requireAdminRoute();

    const statusParam = req.nextUrl.searchParams.get('status');
    let statusFilter: TutorChangeRequestStatus | undefined;
    if (statusParam) {
      if (!ALLOWED_STATUSES.includes(statusParam as TutorChangeRequestStatus)) {
        throw BadRequest(
          `status must be one of: ${ALLOWED_STATUSES.join(', ')}`,
        );
      }
      statusFilter = statusParam as TutorChangeRequestStatus;
    }

    const data = await getAllRequests(statusFilter);
    return jsonResponse({ ok: true as const, data });
  } catch (e) {
    logger.warn('GET /api/admin/tutor-change-requests failed', {
      error: describeError(e),
    });
    return errorResponse(e);
  }
}

import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { adminResolveRequestSchema } from '@/lib/validations/tutor-change';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { resolveRequest } from '@/services/admin/tutor-change';

// =====================================================================
// Sprint 6 — PATCH /api/admin/tutor-change-requests/[id]/resolution
//
// Admin resolves a tutor-change request.
//
// Two flavours:
//   - Body { selected_tutor_id: uuid } — admin re-points the
//     booking and closes the request as 'completed'.
//   - Body { admin_notes: string }    — admin cancels the
//     request.
//
// Authorisation: admin only.
// =====================================================================

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminRoute();
    const { id } = await ctx.params;

    const body = await req.json().catch(() => null);
    const input = adminResolveRequestSchema.parse(body);
    const updated = await resolveRequest(id, input);
    return jsonResponse({ ok: true as const, data: updated });
  } catch (e) {
    logger.warn(
      'PATCH /api/admin/tutor-change-requests/[id]/resolution failed',
      { error: describeError(e) },
    );
    return errorResponse(e);
  }
}

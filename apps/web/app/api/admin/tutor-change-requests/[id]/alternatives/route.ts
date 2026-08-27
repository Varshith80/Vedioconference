import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { adminProposeAlternativesSchema } from '@/lib/validations/tutor-change';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { proposeAlternatives } from '@/services/admin/tutor-change';

// =====================================================================
// Sprint 6 — PATCH /api/admin/tutor-change-requests/[id]/alternatives
//
// Admin proposes 1..3 alternative tutors for a pending request.
//   Body: { alternative_tutor_ids: uuid[] }
//
// Authorisation: admin only (requireAdminRoute).
// =====================================================================

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminRoute();
    const { id } = await ctx.params;

    const body = await req.json().catch(() => null);
    const input = adminProposeAlternativesSchema.parse(body);
    const updated = await proposeAlternatives(id, input);
    return jsonResponse({ ok: true as const, data: updated });
  } catch (e) {
    logger.warn(
      'PATCH /api/admin/tutor-change-requests/[id]/alternatives failed',
      { error: describeError(e) },
    );
    return errorResponse(e);
  }
}

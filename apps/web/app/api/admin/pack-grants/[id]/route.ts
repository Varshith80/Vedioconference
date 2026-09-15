import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { NotFound } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { getPackGrantById } from '@/services/admin/pack-grants';

// =====================================================================
// Phase 1 — Feature B: GET /api/admin/pack-grants/[id].
//
// Admin-only. Returns the full Pack grant row, with the
// student name + email flattened in (same shape as the list
// endpoint). 404 when the row is missing or the caller is
// not authorised to see it (we cannot distinguish miss-
// from-RLS-deny without a larger refactor; both render 404,
// which is the safer default for an admin surface).
// =====================================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminRoute();
    const { id } = await params;
    const row = await getPackGrantById(id);
    if (!row) {
      throw NotFound('Pack grant not found.');
    }
    return jsonResponse({ ok: true as const, data: row });
  } catch (e) {
    return errorResponse(e);
  }
}

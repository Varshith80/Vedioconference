import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { NotFound } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import {
  calculatePackRefundPreview,
  getPackGrantById,
} from '@/services/admin/pack-grants';

// =====================================================================
// Phase 1 — Feature B: GET /api/admin/pack-grants/[id]/refund-preview.
//
// Admin-only. Returns the refund preview WITHOUT mutating the
// row. The preview is the same number the operator sees on
// the detail page; the page calls this endpoint on render so
// the operator can copy the actual refund amount into a
// ticket without having to re-derive it.
//
// HTTP shape:
//   200 → { ok, data: { preview: { kind: 'ok', ... } } }
//   200 → { ok, data: { preview: { kind: 'already_refunded' } } }
//   200 → { ok, data: { preview: { kind: 'invalid_state', ... } } }
//   404 → no such pack grant
//   403 → caller is not an admin
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
    const preview = calculatePackRefundPreview({
      totalCredits: row.totalCredits,
      consumedCredits: row.consumedCredits,
      amountCents: row.amountCents,
      status: row.status,
    });
    return jsonResponse({ ok: true as const, data: { preview } });
  } catch (e) {
    return errorResponse(e);
  }
}

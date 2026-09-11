import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { getNextSessionPosition } from '@/services/admin/catalog';

// =====================================================================
// Sprint 3.8 — GET /api/sessions/next-position?chapterId=...
//
// Returns `{ position: number }` = max(position)+1 for the given
// chapter (or 1 when the chapter has no sessions yet). Used by
// the session-create form to pre-fill the position field when the
// admin changes the parent chapter. Admin-only because position
// is a write-side concern (the public student flow never sees
// session positions).
// =====================================================================

export async function GET(req: NextRequest) {
  try {
    await requireAdminRoute();
    const url = new URL(req.url);
    const chapterId = url.searchParams.get('chapterId');
    if (!chapterId) {
      throw BadRequest('chapterId is required.');
    }
    const position = await getNextSessionPosition(chapterId);
    return jsonResponse({ ok: true as const, data: { position } });
  } catch (e) {
    return errorResponse(e);
  }
}

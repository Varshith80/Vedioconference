import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { markAllAsReadBodySchema } from '@/lib/validations/notifications';
import { markAllAsRead } from '@/services/notifications';

// =====================================================================
// Sprint 7 — POST /api/notifications/read-all
//
//   Auth: signed-in user (REQUIRED). The route delegates to
//         `services/notifications.markAllAsRead` which calls
//         `supabase.auth.getUser()` and rejects anonymous callers.
//   Body: empty / ignored.
//   Returns: { ok: true, data: { updated: number } }
//
// No path params; no id to validate. The body passthrough is
// preserved for symmetry with `markAsReadBodySchema`.
// =====================================================================

export async function POST(req: NextRequest) {
  try {
    // Same "stray payload is fine" semantics as the
    // mark-as-read endpoint — ignore the parsed result.
    await req
      .json()
      .then((b: unknown) => markAllAsReadBodySchema.safeParse(b ?? {}))
      .catch(() => undefined);

    const data = await markAllAsRead();
    return jsonResponse({ ok: true as const, data });
  } catch (e) {
    return errorResponse(e);
  }
}

import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { BadRequest, Unauthorized } from '@/lib/utils/errors';
import { listNotificationsQuerySchema } from '@/lib/validations/notifications';
import { listMyNotifications } from '@/services/notifications';
import { decodeCursor } from '@/lib/validations/cursor';

// =====================================================================
// Sprint 7 (M5.2) + Sprint 8 (N-3 cursor pagination) Notification
// feed API surface.
//
// GET /api/notifications
//   Query: ?limit=number (1..100, default 20)
//          &unread_only=true|false
//          &cursor=<opaque> (preferred — base64-url `{ts,id}` tuple)
//          &before=<ISO 8601> (DEPRECATED — kept for one release)
//   Auth: signed-in user (REQUIRED). RLS scopes the result to
//         `auth.uid() = user_id or is_admin()`.
//   Returns: { ok: true, data: Notification[], nextCursor: string|null }
//
// We pick the Supabase client inside the service layer
// (services/notifications.ts). The route is intentionally thin:
// auth + Zod + service call + response.
// =====================================================================

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('Sign in required.');

    // Use URLSearchParams so the route does not depend on
    // NextRequest's `nextUrl.searchParams` shape — we already
    // validated auth via the SSR client and we only need to
    // parse the query.
    const sp = req.nextUrl?.searchParams ?? new URL(req.url).searchParams;
    const rawCursor = sp.get('cursor') ?? undefined;
    if (rawCursor && !decodeCursor(rawCursor)) {
      throw BadRequest('Invalid `cursor` parameter.');
    }
    const rawQuery = {
      limit: sp.get('limit') ?? undefined,
      unread_only: sp.get('unread_only') ?? undefined,
      cursor: rawCursor,
      before: sp.get('before') ?? undefined,
    };
    const parsed = listNotificationsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      const { ZodError } = await import('zod');
      throw new ZodError(parsed.error.issues);
    }

    const { data, nextCursor } = await listMyNotifications({
      limit: parsed.data.limit,
      unreadOnly: parsed.data.unread_only,
      cursor: parsed.data.cursor,
      before: parsed.data.before,
    });
    return jsonResponse({ ok: true as const, data, nextCursor });
  } catch (e) {
    return errorResponse(e);
  }
}

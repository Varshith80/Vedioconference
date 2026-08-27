import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { Unauthorized } from '@/lib/utils/errors';
import { listNotificationsQuerySchema } from '@/lib/validations/notifications';
import { listMyNotifications } from '@/services/notifications';

// =====================================================================
// Sprint 7 — M5.2 Notification feed API surface.
//
// GET /api/notifications
//   Query: ?limit=number (1..100, default 20)
//          &unread_only=true|false
//          &before=ISO 8601 timestamp (cursor — items strictly older)
//   Auth: signed-in user (REQUIRED). RLS scopes the result to
//         `auth.uid() = user_id or is_admin()`.
//   Returns: { ok: true, data: Notification[] }
//
// We pick the Supabase client inside the service layer
// (services/notifications.ts). The route is intentionally thin:
// auth + Zod + service call + response. No SaaS, no new env, no
// new schema — the existing `public.notifications` table with its
// existing RLS policies is the entire data source.
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
    const rawQuery = {
      limit: sp.get('limit') ?? undefined,
      unread_only: sp.get('unread_only') ?? undefined,
      before: sp.get('before') ?? undefined,
    };
    const parsed = listNotificationsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      // Re-throw a synthetic Zod-shaped ApiError so the route's
      // errorResponse turns it into a 422 with the Zod flatten
      // payload. This keeps the route body identical to the
      // body-validation routes under /api/student/tutor-change-*.
      const { ZodError } = await import('zod');
      throw new ZodError(parsed.error.issues);
    }

    const data = await listMyNotifications({
      limit: parsed.data.limit,
      unreadOnly: parsed.data.unread_only,
      before: parsed.data.before,
    });
    return jsonResponse({ ok: true as const, data });
  } catch (e) {
    return errorResponse(e);
  }
}

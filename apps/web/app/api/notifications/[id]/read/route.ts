import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { Unauthorized } from '@/lib/utils/errors';
import {
  markAsReadBodySchema,
  notificationIdParamSchema,
} from '@/lib/validations/notifications';
import { markAsRead } from '@/services/notifications';

// =====================================================================
// Sprint 7 — POST /api/notifications/[id]/read
//
//   Auth: signed-in user (REQUIRED). RLS scopes the UPDATE to
//         the caller's own rows — they cannot mark someone
//         else's notification as read.
//   Body: empty / ignored.
//   Returns: { ok: true, data: Notification }
//
// We validate the path id with `notificationIdParamSchema` BEFORE
// touching the service. The body is accepted-but-discarded — the
// passthrough schema is intentional so a stray payload does not
// 422.
// =====================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('Sign in required.');

    const { id } = notificationIdParamSchema.parse(await params);

    // Best-effort body parse — we do not need the result, but we
    // want the same "stray payload is fine" semantics as the
    // passthrough schema declares. If the body is malformed JSON
    // we ignore it (the endpoint does not take a meaningful body).
    await req
      .json()
      .then((b: unknown) => markAsReadBodySchema.safeParse(b ?? {}))
      .catch(() => undefined);

    const data = await markAsRead(id);
    return jsonResponse({ ok: true as const, data });
  } catch (e) {
    return errorResponse(e);
  }
}

import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { Forbidden, NotFound, Unauthorized, describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { studentSelectAlternativeSchema } from '@/lib/validations/tutor-change';
import {
  getMyRequestById,
  selectAlternative,
} from '@/services/student/tutor-change';

// =====================================================================
// Sprint 6 — /api/student/tutor-change-requests/[id]
//
// GET    — student fetches a single request they own.
// PATCH  — student picks one of the proposed alternatives.
//          Body: { selected_tutor_id: uuid }
//
// Authorisation: every request is scoped to auth.uid() via the
// `student_id = auth.uid()` policy on `tutor_change_requests`.
// The service layer does a second ownership check after the
// load so a future RLS regression does not leak data.
// =====================================================================

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('Sign in required.');

    const data = await getMyRequestById(id);
    if (!data) throw NotFound('Tutor change request not found.');
    if (data.student_id !== user.id) {
      throw Forbidden('You do not own this tutor change request.');
    }
    return jsonResponse({ ok: true as const, data });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('Sign in required.');

    // Pre-flight ownership check before any mutation.
    const existing = await getMyRequestById(id);
    if (!existing) throw NotFound('Tutor change request not found.');
    if (existing.student_id !== user.id) {
      throw Forbidden('You do not own this tutor change request.');
    }

    const body = await req.json().catch(() => null);
    const input = studentSelectAlternativeSchema.parse(body);
    const updated = await selectAlternative(id, input);
    return jsonResponse({ ok: true as const, data: updated });
  } catch (e) {
    logger.warn('PATCH /api/student/tutor-change-requests/[id] failed', {
      error: describeError(e),
    });
    return errorResponse(e);
  }
}

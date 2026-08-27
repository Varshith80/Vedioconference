import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { Unauthorized } from '@/lib/utils/errors';
import { createTutorChangeRequestSchema } from '@/lib/validations/tutor-change';
import {
  createRequest,
  getMyRequests,
} from '@/services/student/tutor-change';

// =====================================================================
// Sprint 6 — Student tutor-change-request API surface.
//
// POST /api/student/tutor-change-requests
//   Body: { session_booking_id: uuid; student_reason?: string }
//   Auth: signed-in student (REQUIRED).
//   Returns: { ok: true, data: TutorChangeRequest }
//
// GET  /api/student/tutor-change-requests
//   Auth: signed-in student.
//   Returns: { ok: true, data: TutorChangeRequest[] } (own only)
//
// We pick the right Supabase client inside the service layer
// (student SSR client for SELECTs; admin client only for the
// re-point write on selection — see selectAlternative in
// services/student/tutor-change.ts). The route is intentionally
// thin: auth + Zod + service call + response.
// =====================================================================

export async function GET() {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('Sign in required.');
    const data = await getMyRequests();
    return jsonResponse({ ok: true as const, data });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('Sign in required.');

    const body = await req.json().catch(() => null);
    const input = createTutorChangeRequestSchema.parse(body);
    const created = await createRequest(input);
    return jsonResponse({ ok: true as const, data: created }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

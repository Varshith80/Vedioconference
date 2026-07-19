import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { createTutor, getAllTutors } from '@/services/admin/tutors';
import { adminTutorCreateSchema } from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — GET /api/admin/tutors (admin-only). Public
// `/api/tutors` keeps the published-only filter; this admin
// route returns every tutor (active + inactive + archived),
// matching the directory surface in /admin/tutors.
//
// The route is intentionally thin — the page-level
// `getAllTutors()` is the canonical read; the route is the
// public API shape for future integrations (e.g. a CSV
// export job).
//
// POST /api/admin/tutors — create a tutor. Used by the
// "Create tutor" dialog on /admin/tutors. Minimum surface
// (name, email, headline, bio, zoom_user_id, calendly_event_uri,
// is_published) — there is no tutor dashboard or auth login
// in this version.
// =====================================================================

export async function GET() {
  try {
    await requireAdminRoute();
    const tutors = await getAllTutors();
    return jsonResponse({ ok: true as const, data: tutors });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminRoute();
    const raw = await req.json().catch(() => null);
    const parsed = adminTutorCreateSchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }
    const tutor = await createTutor(parsed.data);
    return jsonResponse({ ok: true as const, data: tutor }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

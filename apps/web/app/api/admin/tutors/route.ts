import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import {
  createTutor,
  deleteTutor,
  getAllTutors,
} from '@/services/admin/tutors';
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
    // requireAdminRoute() does the role check (404/403 on
    // failure) AND returns the same user-context Supabase
    // client the role check approved. We pass it through to
    // createTutor so the INSERT runs with the exact same
    // session cookies / Authorization header that the role
    // check approved. The cached() helper makes the second
    // call cheap when requireAdminRoute has already been
    // awaited earlier in the same request (e.g. in a future
    // GET→POST roundtrip from the same admin client).
    const { supabase } = await requireAdminRoute();
    const raw = await req.json().catch(() => null);
    const parsed = adminTutorCreateSchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }
    const tutor = await createTutor(parsed.data, supabase);
    return jsonResponse({ ok: true as const, data: tutor }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

// DELETE /api/admin/tutors — delete a tutor by id. Used by the
// trash icon on /admin/tutors.
//
// Body: `{ id: string }` (the tutor's UUID). We accept the id
// in the body (not as a path segment) so the route stays
// collection-level — it matches the existing GET/POST shape, so
// callers don't need to learn two different URL shapes for the
// same resource.
//
// Returns 200 on success, 409 when the tutor still has
// upcoming assigned sessions (admin must unassign them from
// /admin/sessions first), 404 when the tutor does not exist,
// 400 when the body is malformed.
const adminTutorDeleteBodySchema = z.object({
  id: z.string().uuid('Tutor id must be a UUID.'),
});

export async function DELETE(req: NextRequest) {
  try {
    const { supabase } = await requireAdminRoute();
    const raw = await req.json().catch(() => null);
    const parsed = adminTutorDeleteBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }
    const result = await deleteTutor(parsed.data.id, supabase);
    return jsonResponse({ ok: true as const, data: result });
  } catch (e) {
    return errorResponse(e);
  }
}

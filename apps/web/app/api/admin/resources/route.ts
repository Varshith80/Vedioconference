import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import {
  createResource,
  listAllResources,
} from '@/services/resources';
import { adminResourceCreateSchema } from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 8 — R-1 + R-2 Resources delivery surface (admin).
//
// GET  /api/admin/resources — list every resource (admin scope).
// POST /api/admin/resources — create a new resource. The route
//   enforces the admin role via `requireAdminRoute()` and
//   passes the same SSR Supabase client through to
//   `createResource`, so the `resources_write_admin_or_tutor`
//   RLS policy fires against the exact same session the role
//   check approved.
//
// The student-facing read lives at /api/resources (kept as a
// thin route that uses the SSR client directly — the RLS
// policy `resources_select_visible` filters out anything the
// student is not allowed to see).
// =====================================================================

export async function GET() {
  try {
    await requireAdminRoute();
    const resources = await listAllResources();
    return jsonResponse({ ok: true as const, data: resources });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase } = await requireAdminRoute();
    const raw = await req.json().catch(() => null);
    const parsed = adminResourceCreateSchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }
    const resource = await createResource(parsed.data, supabase);
    return jsonResponse({ ok: true as const, data: resource }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
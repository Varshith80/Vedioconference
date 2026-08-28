import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import {
  deleteResource,
  updateResource,
} from '@/services/resources';
import { adminResourceEditSchema } from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 8 — PATCH + DELETE /api/admin/resources/[id] (admin).
//
// PATCH: every field optional. Returns the updated resource.
// DELETE: hard delete. Returns 200 with `{ id }` on success,
// 404 when no row matched.
// =====================================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireAdminRoute();
    const { id } = await params;

    const raw = await req.json().catch(() => null);
    const parsed = adminResourceEditSchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }

    const resource = await updateResource(id, parsed.data, supabase);
    return jsonResponse({ ok: true as const, data: resource });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireAdminRoute();
    const { id } = await params;

    const result = await deleteResource(id, supabase);
    return jsonResponse({ ok: true as const, data: result });
  } catch (e) {
    return errorResponse(e);
  }
}
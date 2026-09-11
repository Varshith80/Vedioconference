import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest, NotFound, ApiError } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';
import { adminProgramEditSchema } from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — PATCH + DELETE /api/programs/[id] (admin).
//
// PATCH: every field optional; the handler writes only what the
// caller sent. A 23505 unique_violation on `slug` maps to 409.
//
// DELETE: hard delete. A 23503 foreign_key_violation (the
// program still has courses pointing at it) maps to 409 with a
// helpful message — the admin must move/delete the courses
// first.
// =====================================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireAdminRoute();
    const { id } = await params;

    const raw = await req.json().catch(() => null);
    const parsed = adminProgramEditSchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }
    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      throw BadRequest('At least one field must be provided.');
    }

    const { data, error } = await supabase
      .from('programs')
      .update(updates as never)
      .eq('id', id)
      .select('id, slug, title, is_published')
      .single();
    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') {
        throw NotFound(`Program not found: ${id}`);
      }
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(
          409,
          'program_slug_conflict',
          'A program with this slug already exists.',
        );
      }
      logger.error('Failed to update program', { error: error.message, id, updates });
      throw new ApiError(500, 'program_update_failed', 'Could not update program.', {
        reason: error.message,
      });
    }

    return jsonResponse({ ok: true as const, data });
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

    const { error } = await supabase.from('programs').delete().eq('id', id);
    if (error) {
      if ((error as { code?: string }).code === '23503') {
        throw new ApiError(
          409,
          'program_has_courses',
          'Program has courses. Delete or move them first.',
        );
      }
      logger.error('Failed to delete program', { error: error.message, id });
      throw new ApiError(500, 'program_delete_failed', 'Could not delete program.', {
        reason: error.message,
      });
    }

    return jsonResponse({ ok: true as const, data: null });
  } catch (e) {
    return errorResponse(e);
  }
}

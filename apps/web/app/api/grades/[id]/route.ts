import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest, NotFound, ApiError } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';
import { adminGradeEditSchema } from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — PATCH + DELETE /api/grades/[id] (admin).
//
// PATCH: every field optional. `program_slug` is resolved to
// `program_id` only when supplied; the natural key on (program_id,
// slug) is re-checked on insert and on update via a 23505 mapping.
//
// DELETE: a 23503 (the grade still has courses) maps to 409.
// =====================================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireAdminRoute();
    const { id } = await params;

    const raw = await req.json().catch(() => null);
    const parsed = adminGradeEditSchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }
    const updates: Record<string, unknown> = { ...parsed.data };
    if (typeof updates['program_slug'] === 'string') {
      const { data: program, error: pErr } = await supabase
        .from('programs')
        .select('id')
        .eq('slug', updates['program_slug'] as string)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!program) {
        throw NotFound(`Program not found: ${updates['program_slug'] as string}`);
      }
      updates['program_id'] = (program as unknown as { id: string }).id;
      delete updates['program_slug'];
    }
    if (Object.keys(updates).length === 0) {
      throw BadRequest('At least one field must be provided.');
    }

    const { data, error } = await supabase
      .from('grades')
      .update(updates as never)
      .eq('id', id)
      .select('id, slug, title, program_id')
      .single();
    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') {
        throw NotFound(`Grade not found: ${id}`);
      }
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(
          409,
          'grade_slug_conflict',
          'A grade with this slug already exists in this program.',
        );
      }
      logger.error('Failed to update grade', { error: error.message, id, updates });
      throw new ApiError(500, 'grade_update_failed', 'Could not update grade.', {
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

    const { error } = await supabase.from('grades').delete().eq('id', id);
    if (error) {
      if ((error as { code?: string }).code === '23503') {
        throw new ApiError(
          409,
          'grade_has_courses',
          'Grade has courses. Delete or move them first.',
        );
      }
      logger.error('Failed to delete grade', { error: error.message, id });
      throw new ApiError(500, 'grade_delete_failed', 'Could not delete grade.', {
        reason: error.message,
      });
    }

    return jsonResponse({ ok: true as const, data: null });
  } catch (e) {
    return errorResponse(e);
  }
}

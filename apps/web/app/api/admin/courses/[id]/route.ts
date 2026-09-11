import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest, NotFound, ApiError } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';
import { adminCourseEditSchema } from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — PATCH + DELETE /api/admin/courses/[id] (admin).
//
// Lives under the /api/admin namespace (alongside
// /api/admin/overview and /api/admin/import-excel) to avoid
// clashing with the public /api/courses/[slug] GET endpoint.
//
// PATCH: every field optional; resolves program_slug / grade_slug to
// the FK columns when supplied. A 23505 unique_violation on `slug`
// maps to 409.
//
// DELETE: hard delete. A 23503 foreign_key_violation (the course
// still has chapters pointing at it) maps to 409 — the admin must
// delete or move the chapters first.
// =====================================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireAdminRoute();
    const { id } = await params;

    const raw = await req.json().catch(() => null);
    const parsed = adminCourseEditSchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }
    const updates: Record<string, unknown> = { ...parsed.data };

    // Resolve program_slug → program_id if supplied.
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

    // Resolve grade_slug → grade_id if supplied. grade_id must
    // be inside the (now-resolved) program_id. When only one of
    // the two is supplied, the lookup uses whichever is known.
    if (typeof updates['grade_slug'] === 'string') {
      const programId = updates['program_id'] as string | undefined;
      let q = supabase.from('grades').select('id').eq('slug', updates['grade_slug'] as string);
      if (programId) q = q.eq('program_id', programId);
      const { data: grade, error: gErr } = await q.maybeSingle();
      if (gErr) throw gErr;
      if (!grade) {
        throw NotFound(
          `Grade not found: ${updates['grade_slug'] as string}` +
            (programId ? ` (in program ${programId})` : ''),
        );
      }
      updates['grade_id'] = (grade as unknown as { id: string }).id;
      delete updates['grade_slug'];
    }

    if (Object.keys(updates).length === 0) {
      throw BadRequest('At least one field must be provided.');
    }

    const { data, error } = await supabase
      .from('courses')
      .update(updates as never)
      .eq('id', id)
      .select('id, slug, title, is_published')
      .single();
    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') {
        throw NotFound(`Course not found: ${id}`);
      }
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'course_slug_conflict', 'A course with this slug already exists.');
      }
      logger.error('Failed to update course', { error: error.message, id, updates });
      throw new ApiError(500, 'course_update_failed', 'Could not update course.', {
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

    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) {
      if ((error as { code?: string }).code === '23503') {
        throw new ApiError(
          409,
          'course_has_chapters',
          'Course has chapters. Delete them first.',
        );
      }
      logger.error('Failed to delete course', { error: error.message, id });
      throw new ApiError(500, 'course_delete_failed', 'Could not delete course.', {
        reason: error.message,
      });
    }

    return jsonResponse({ ok: true as const, data: null });
  } catch (e) {
    return errorResponse(e);
  }
}

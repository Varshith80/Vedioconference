import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest, NotFound, ApiError } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';
import { adminChapterEditSchema } from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — PATCH + DELETE /api/chapters/[id] (admin).
//
// PATCH: every field optional. A 23505 unique_violation on
// (course_id, slug) maps to 409.
//
// DELETE: FK CASCADE on the sessions table means deleting a
// chapter drops its sessions automatically. We surface that
// to the admin via the success log so an audit is possible.
// =====================================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireAdminRoute();
    const { id } = await params;

    const raw = await req.json().catch(() => null);
    const parsed = adminChapterEditSchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }
    const updates: Record<string, unknown> = { ...parsed.data };
    if (Object.keys(updates).length === 0) {
      throw BadRequest('At least one field must be provided.');
    }

    const { data, error } = await supabase
      .from('chapters')
      .update(updates as never)
      .eq('id', id)
      .select('id, slug, title, sort_order, is_published')
      .single();
    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') {
        throw NotFound(`Chapter not found: ${id}`);
      }
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(
          409,
          'chapter_slug_conflict',
          'A chapter with this slug already exists for this course.',
        );
      }
      logger.error('Failed to update chapter', { error: error.message, id, updates });
      throw new ApiError(500, 'chapter_update_failed', 'Could not update chapter.', {
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

    const { error } = await supabase.from('chapters').delete().eq('id', id);
    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') {
        // 0 rows matched — nothing to delete.
        throw NotFound(`Chapter not found: ${id}`);
      }
      logger.error('Failed to delete chapter', { error: error.message, id });
      throw new ApiError(500, 'chapter_delete_failed', 'Could not delete chapter.', {
        reason: error.message,
      });
    }

    return jsonResponse({ ok: true as const, data: null });
  } catch (e) {
    return errorResponse(e);
  }
}

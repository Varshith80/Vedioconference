import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest, NotFound, ApiError } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';
import { adminGradeCreateSchema } from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — POST /api/grades (admin create).
//
// Resolves the parent program by slug, then inserts a Grade
// under it. The (program_id, slug) unique constraint is the
// contract: a 23505 violation maps to 409.
// =====================================================================

export async function POST(req: NextRequest) {
  try {
    const { supabase } = await requireAdminRoute();

    const raw = await req.json().catch(() => null);
    const parsed = adminGradeCreateSchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }

    const { data: program, error: pErr } = await supabase
      .from('programs')
      .select('id')
      .eq('slug', parsed.data.program_slug)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!program) throw NotFound(`Program not found: ${parsed.data.program_slug}`);
    const programId = (program as unknown as { id: string }).id;

    const insertPayload = {
      program_id: programId,
      slug: parsed.data.slug,
      title: parsed.data.title,
      sort_order: parsed.data.sort_order ?? 0,
    };

    const { data, error } = await supabase
      .from('grades')
      .insert(insertPayload as never)
      .select('id, slug, title')
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(
          409,
          'grade_slug_conflict',
          'A grade with this slug already exists in this program.',
        );
      }
      logger.error('Failed to create grade', { error: error.message, payload: insertPayload });
      throw new ApiError(500, 'grade_create_failed', 'Could not create grade.', {
        reason: error.message,
      });
    }
    const row = data as unknown as { id: string; slug: string; title: string };

    return jsonResponse(
      { ok: true as const, data: { grade_id: row.id, slug: row.slug, title: row.title } },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

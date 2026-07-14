import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest, NotFound, ApiError } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';

// =====================================================================
// Sprint 3.6 §4.5 — POST /api/courses (admin create).
//
// The existing GET /api/courses is public + paginated and
// the existing GET /api/courses/[slug] is public + single.
// This POST is admin-only; it is the parent for the
// chapter / session creation chain. The importer does NOT
// use this route (it inserts courses directly via the
// ON CONFLICT upsert in lib/excel/import.ts); this route
// exists for manual admin creation.
// =====================================================================

const bodySchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/u, 'slug must be lowercase letters, digits, and dashes'),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(400).optional(),
  description: z.string().max(5000).optional(),
  program_slug: z.string().min(1).max(120),
  grade_slug: z.string().min(1).max(120).optional(),
  subject: z.string().min(1).max(120).optional(),
  level: z.string().min(1).max(120).optional(),
  level_group: z.string().min(1).max(120).optional(),
  is_published: z.boolean().optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { supabase } = await requireAdminRoute();

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }

    // Resolve the parent program and (optional) grade by
    // slug. The admin form surfaces the slug; the DB stores
    // the FK.
    const { data: program, error: pErr } = await supabase
      .from('programs')
      .select('id')
      .eq('slug', parsed.data.program_slug)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!program) throw NotFound(`Program not found: ${parsed.data.program_slug}`);
    const programId = (program as unknown as { id: string }).id;

    let gradeId: string | null = null;
    if (parsed.data.grade_slug) {
      const { data: grade, error: gErr } = await supabase
        .from('grades')
        .select('id')
        .eq('program_id', programId)
        .eq('slug', parsed.data.grade_slug)
        .maybeSingle();
      if (gErr) throw gErr;
      if (!grade) {
        throw NotFound(
          `Grade not found: ${parsed.data.grade_slug} (in program ${parsed.data.program_slug})`,
        );
      }
      gradeId = (grade as unknown as { id: string }).id;
    }

    const insertPayload = {
      slug: parsed.data.slug,
      title: parsed.data.title,
      subtitle: parsed.data.subtitle ?? null,
      description: parsed.data.description ?? null,
      program_id: programId,
      grade_id: gradeId,
      subject: parsed.data.subject ?? parsed.data.title,
      level: parsed.data.level ?? null,
      level_group: parsed.data.level_group ?? parsed.data.program_slug,
      is_published: parsed.data.is_published ?? false,
      sort_order: parsed.data.sort_order ?? 0,
    };

    const { data, error } = await supabase
      .from('courses')
      .insert(insertPayload as never)
      .select('id, slug, title')
      .single();
    if (error) {
      // 23505 = unique_violation on the slug.
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'course_slug_conflict', 'A course with this slug already exists.');
      }
      logger.error('Failed to create course', { error: error.message, payload: insertPayload });
      throw new ApiError(500, 'course_create_failed', 'Could not create course.', {
        reason: error.message,
      });
    }
    const row = data as unknown as { id: string; slug: string; title: string };

    return jsonResponse(
      { ok: true as const, data: { course_id: row.id, slug: row.slug, title: row.title } },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

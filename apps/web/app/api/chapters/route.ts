import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest, NotFound, ApiError } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';

// =====================================================================
// Sprint 3.6 §4.5 — POST /api/chapters (admin create).
//
// The Excel importer inserts chapters directly via the
// ON CONFLICT upsert in lib/excel/import.ts. This route
// exists for manual admin creation. Pairs with
// POST /api/courses and POST /api/sessions to form the
// full create chain.
// =====================================================================

const bodySchema = z.object({
  course_slug: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/u, 'slug must be lowercase letters, digits, and dashes'),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  default_duration_min: z.number().int().positive().nullable().optional(),
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

    // Resolve the parent course by slug.
    const { data: course, error: cErr } = await supabase
      .from('courses')
      .select('id')
      .eq('slug', parsed.data.course_slug)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!course) throw NotFound(`Course not found: ${parsed.data.course_slug}`);
    const courseId = (course as unknown as { id: string }).id;

    const insertPayload = {
      course_id: courseId,
      slug: parsed.data.slug,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      default_duration_min: parsed.data.default_duration_min ?? null,
      is_published: parsed.data.is_published ?? false,
      sort_order: parsed.data.sort_order ?? 0,
    };

    const { data, error } = await supabase
      .from('chapters')
      .insert(insertPayload as never)
      .select('id, slug, title')
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'chapter_slug_conflict', 'A chapter with this slug already exists for this course.');
      }
      logger.error('Failed to create chapter', { error: error.message, payload: insertPayload });
      throw new ApiError(500, 'chapter_create_failed', 'Could not create chapter.', {
        reason: error.message,
      });
    }
    const row = data as unknown as { id: string; slug: string; title: string };

    return jsonResponse(
      { ok: true as const, data: { chapter_id: row.id, slug: row.slug, title: row.title } },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

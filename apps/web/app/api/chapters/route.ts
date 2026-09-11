import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest, NotFound, ApiError } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';
import { getNextChapterPosition } from '@/services/admin/catalog';

// =====================================================================
// Sprint 3.6 §4.5 — POST /api/chapters (admin create).
//
// The Excel importer inserts chapters directly via the
// ON CONFLICT upsert in lib/excel/import.ts. This route
// exists for manual admin creation. Pairs with
// POST /api/courses and POST /api/sessions to form the
// full create chain.
//
// v2 schema: `chapters.position` is NOT NULL CHECK (position
// > 0), with UNIQUE (course_id, position). The previous
// version of this route wrote only the v1 `sort_order` column
// and never set `position`, so the DB rejected every insert
// with `null value in column "position"`. The body now
// accepts `position`; if the caller omits it (e.g. the
// chapter-create form does not surface the field), the route
// computes `max(position)+1` for the course via
// getNextChapterPosition(). The admin can still override the
// value to insert at a specific position; a collision surfaces
// as 409 (the (course_id, position) unique constraint).
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
  position: z.number().int().positive().optional(),
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

    // Server-side default for `position`. The chapter-create
    // form does not expose the field (mirroring the session-
    // create form's "position is pre-filled, you can override"
    // UX), so we compute max(position)+1 for the course when
    // the caller omits it. A duplicate still surfaces as 409
    // from the unique constraint.
    const position =
      parsed.data.position ?? (await getNextChapterPosition(courseId));

    const insertPayload = {
      course_id: courseId,
      slug: parsed.data.slug,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      default_duration_min: parsed.data.default_duration_min ?? null,
      is_published: parsed.data.is_published ?? false,
      position,
    };

    const { data, error } = await supabase
      .from('chapters')
      .insert(insertPayload as never)
      .select('id, slug, title')
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        // 23505 fires for BOTH the (course_id, slug) unique
        // constraint and the (course_id, position) unique
        // constraint. The admin gets a single 409 message;
        // which constraint tripped is visible in the DB log
        // (the message includes the constraint name).
        throw new ApiError(
          409,
          'chapter_conflict',
          'A chapter with this slug or position already exists for this course.',
        );
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

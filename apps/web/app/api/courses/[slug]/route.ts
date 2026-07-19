import { type NextRequest } from 'next/server';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/utils/api';
import { NotFound } from '@/lib/utils/errors';

/**
 * GET /api/courses/[slug] – public, single course.
 *
 * Sprint 3.8 — Tutors are standalone. There is no longer a
 * `course_tutors` join table; the assigned tutor now lives on
 * each session row (`sessions.tutor_id`). The course-level
 * payload therefore no longer embeds `course_tutors`; the
 * public marketing pages iterate the curriculum chain and
 * surface assigned tutors at the session level.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .single();
    if (error || !data) throw NotFound('Cours introuvable.');
    return Response.json({ data });
  } catch (e) { return errorResponse(e); }
}

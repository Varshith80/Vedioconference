import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/utils/api';
import { NotFound } from '@/lib/utils/errors';

/** GET /api/courses/[slug] – public, single course. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('courses')
      .select('*, course_tutors(tutor:tutors(*, profile:profiles(*)))')
      .eq('slug', slug)
      .eq('is_published', true)
      .single();
    if (error || !data) throw NotFound('Cours introuvable.');
    return NextResponse.json({ data });
  } catch (e) { return errorResponse(e); }
}

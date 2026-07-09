import { type NextRequest } from 'next/server';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/utils/api';

/** GET /api/tutors – public list of published tutors. */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('tutors')
      .select('*, profile:profiles(*)')
      .eq('is_published', true)
      .order('rating_avg', { ascending: false });
    if (error) throw error;
    return Response.json({ data: data ?? [] });
  } catch (e) { return errorResponse(e); }
}

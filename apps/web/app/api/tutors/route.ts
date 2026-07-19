import { type NextRequest } from 'next/server';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/utils/api';

/**
 * GET /api/tutors – public list of active tutors (Sprint 3.8).
 *
 * Standalone tutor: the response carries the standalone row
 * fields (full_name, email, phone, status, notes). There is no
 * profile join (tutors are not users).
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('tutors')
      .select('id, full_name, email, phone, status, notes, created_at, updated_at')
      .eq('status', 'active')
      .order('full_name', { ascending: true });
    if (error) throw error;
    return Response.json({ data: data ?? [] });
  } catch (e) { return errorResponse(e); }
}

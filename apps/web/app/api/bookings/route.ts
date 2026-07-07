import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/services/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/utils/api';
import { Unauthorized } from '@/lib/utils/errors';

/** GET /api/bookings – list the current user's bookings. */
export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) throw Unauthorized();

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('bookings')
      .select('*, course:courses(*), meeting_links(*)')
      .eq('student_id', user.id)
      .order('scheduled_start', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (e) { return errorResponse(e); }
}

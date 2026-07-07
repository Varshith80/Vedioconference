import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/services/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/utils/api';
import { Unauthorized } from '@/lib/utils/errors';

/** GET /api/resources – list the resources the current user can access. */
export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) throw Unauthorized();

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('resources')
      .select('*, course:courses(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (e) { return errorResponse(e); }
}

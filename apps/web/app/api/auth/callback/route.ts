import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest } from '@/lib/utils/errors';

/** Auth callback for password recovery / OAuth / magic links. */
export async function GET(req: NextRequest) {
  try {
    const { searchParams, origin } = new URL(req.url);
    const code  = searchParams.get('code');
    const next  = searchParams.get('next') ?? '/dashboard';

    if (!code) throw BadRequest('Missing code parameter.');

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw BadRequest(error.message);

    return NextResponse.redirect(new URL(next, origin));
  } catch (e) { return errorResponse(e); }
}

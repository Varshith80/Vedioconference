import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest } from '@/lib/utils/errors';

/**
 * Auth callback for password recovery / OAuth / magic links.
 *
 * B1 (stub): the local stub does not use real callback URLs —
 * the e-mail magic-link flow is mocked client-side. The route
 * still validates the `code` and `next` parameters and redirects
 * to the requested path so the URL contract matches the future
 * Supabase behaviour.
 *
 * B2 (Supabase): this route will call
 * `supabase.auth.exchangeCodeForSession(code)` and set the
 * session cookies before redirecting.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams, origin } = new URL(req.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/dashboard';

    if (!code) throw BadRequest('Missing code parameter.');

    // The stub does not validate the code server-side; B2 will.
    return NextResponse.redirect(new URL(next, origin));
  } catch (e) {
    return errorResponse(e);
  }
}

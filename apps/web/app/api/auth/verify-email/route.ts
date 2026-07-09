import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest } from '@/lib/utils/errors';
import { getAuthProvider } from '@/services/auth/auth-provider-factory';

const verifySchema = z.object({
  email: z.string().email(),
  type:  z.enum(['signup', 'recovery', 'email_change']),
  token: z.string().min(1),
});

/**
 * POST /api/auth/verify-email – exchange an OTP for a session.
 *
 * B1 (stub): the local stub accepts any token of 6+ characters
 * and resolves to the current session. B2 will hand the call
 * directly to `supabase.auth.verifyOtp` and set the session
 * cookies before returning.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, type, token } = verifySchema.parse(await req.json());
    const provider = getAuthProvider();
    const result = await provider.verifyOtp({ email, type, token });
    if (!result.ok) throw BadRequest(result.error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/services/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest, Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

const verifySchema = z.object({
  type:  z.enum(['signup', 'recovery', 'email_change']),
  token: z.string().min(1),
});

/** POST /api/auth/verify-email – exchange an OTP for a verified session. */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) throw Unauthorized();
    const { type, token } = verifySchema.parse(await req.json());

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token, email: user.email! });
    if (error) throw BadRequest(error.message);

    logger.info('Email verified', { userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}

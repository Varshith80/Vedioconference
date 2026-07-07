import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/utils/api';
import { registerSchema, forgotPasswordSchema } from '@/lib/validations/auth';
import { logger } from '@/lib/utils/logger';

/**
 * Constant-time delay to mitigate user-enumeration via response timing.
 */
async function constantTime(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** POST /api/auth/register – create a user, force email verification. */
export async function POST(req: NextRequest) {
  try {
    const body = registerSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    const { data, error } = await admin.auth.admin.createUser({
      email:    body.email,
      password: body.password,
      // Do NOT confirm the email server-side; the user must click the link.
      email_confirm: false,
      user_metadata: { full_name: body.fullName },
    });

    if (error || !data.user) {
      // Always reply with a 200 to avoid user enumeration.
      await constantTime(200);
      logger.warn('Register failed', { error: error?.message });
      return NextResponse.json({ ok: true });
    }

    // `identities` is an array; an empty array means the user already
    // existed (Supabase returns the existing user but with []).
    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      await constantTime(200);
      return NextResponse.json({ ok: true });
    }

    // Send the verification email.
    await admin.auth.resend({
      type: 'signup',
      email: body.email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/dashboard`,
      },
    });

    logger.info('User registered', { userId: data.user.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    await constantTime(200);
    return errorResponse(e);
  }
}

/** PUT /api/auth/register – trigger password-reset email. */
export async function PUT(req: NextRequest) {
  try {
    const { email } = forgotPasswordSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    // We always return { ok: true } and apply a constant-time delay to
    // avoid leaking which addresses exist.
    const result = await admin.auth
      .resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
      })
      .catch((err: unknown) => ({ error: err as Error }));

    await constantTime(200);
    if ((result as { error?: unknown }).error) {
      logger.warn('resetPasswordForEmail failed', { email: email.replace(/(.).+(@.+)/, '$1***$2') });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    await constantTime(200);
    return errorResponse(e);
  }
}

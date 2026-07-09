import { NextResponse, type NextRequest } from 'next/server';
import { makeAuthSchemas } from '@/lib/validations/auth';
import { getApiTranslator } from '@/lib/i18n/server';
import { logger } from '@/lib/utils/logger';
import { getAuthProvider } from '@/services/auth/auth-provider-factory';
import { errorResponse } from '@/lib/utils/api';

/**
 * Constant-time delay to mitigate user-enumeration via response
 * timing. The auth provider already does some artificial latency
 * for the stub, but we apply this on the API side too so the
 * client cannot time a no-op.
 */
async function constantTime(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST /api/auth/register – create a user, force e-mail verification.
 *
 * B1 implementation: delegates to the configured AuthProvider. The
 * stub creates a user in localStorage; the B2 Supabase provider
 * will call the Supabase admin SDK. Either way the response is
 * always `{ ok: true }` (no user enumeration) and the client
 * routes the user to the verify-email landing.
 */
export async function POST(req: NextRequest) {
  try {
    const t = await getApiTranslator(req);
    const { registerSchema } = makeAuthSchemas(t);
    const body = registerSchema.parse(await req.json());
    const provider = getAuthProvider();

    const result = await provider.signUp({
      email: body.email,
      password: body.password,
      fullName: body.fullName,
    });

    if (!result.ok) {
      await constantTime(200);
      logger.warn('Register failed', { code: result.error.code });
      return NextResponse.json({ ok: true });
    }

    logger.info('User registered', { userId: result.data.user.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    await constantTime(200);
    return errorResponse(e);
  }
}

/**
 * PUT /api/auth/register – trigger password-reset e-mail.
 *
 * We always return { ok: true } and apply a constant-time delay to
 * avoid leaking which addresses exist.
 */
export async function PUT(req: NextRequest) {
  try {
    const t = await getApiTranslator(req);
    const { forgotPasswordSchema } = makeAuthSchemas(t);
    const { email } = forgotPasswordSchema.parse(await req.json());
    const provider = getAuthProvider();

    const result = await provider.resetPasswordForEmail({ email }).catch((err) => ({
      ok: false as const,
      error: err as Error,
    }));

    await constantTime(200);
    if (!result.ok) {
      logger.warn('resetPasswordForEmail failed', {
        email: email.replace(/(.).+(@.+)/, '$1***$2'),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    await constantTime(200);
    return errorResponse(e);
  }
}

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest, Unauthorized } from '@/lib/utils/errors';
import { makeAuthSchemas } from '@/lib/validations/auth';
import { getApiTranslator } from '@/lib/i18n/server';
import { getAuthProvider } from '@/services/auth/auth-provider-factory';

/**
 * POST /api/auth – sign in with e-mail + password.
 *
 * Delegates to the configured AuthProvider. The cookie set/clear
 * logic for the B2 Supabase provider will live here; for B1 the
 * stub writes to `localStorage` and the API just returns success.
 */
export async function POST(req: NextRequest) {
  try {
    const t = await getApiTranslator(req);
    const { loginSchema } = makeAuthSchemas(t);
    const body = loginSchema.parse(await req.json());
    const provider = getAuthProvider();
    const result = await provider.signInWithPassword(body);
    if (!result.ok) throw Unauthorized(result.error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

const signOutSchema = z.object({ scope: z.enum(['local', 'global']).default('global') });

/**
 * DELETE /api/auth – sign out.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { scope } = signOutSchema.parse(await req.json().catch(() => ({})));
    const provider = getAuthProvider();
    const result = await provider.signOut();
    if (!result.ok) throw BadRequest(result.error.message);
    void scope; // B2 will use it to scope the cookie clear
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

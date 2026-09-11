import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest, Unauthorized } from '@/lib/utils/errors';
import { makeAuthSchemas } from '@/lib/validations/auth';
import { getApiTranslator } from '@/lib/i18n/server';
import { publicEnv } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * POST /api/auth – sign in with e-mail + password.
 *
 * Sprint 8 follow-up. The previous implementation called
 * `getAuthProvider().signInWithPassword(...)`, but
 * `SupabaseAuthProvider` is marked `'use client'` — invoking it
 * from a Route Handler throws
 * "Attempted to call SupabaseAuthProvider() from the server but
 * SupabaseAuthProvider is on the client". The matching DELETE
 * handler already works around this by going through the
 * cookie-backed SSR client; we apply the same pattern here.
 *
 * The route is functionally a no-op in the React login form
 * today (the form posts straight to the Supabase browser
 * client), but it is part of the public API surface and is
 * reachable from curl, server-to-server integrations, and the
 * automated test suite. Returning the right session shape here
 * keeps the contract honest.
 *
 * Returns `{ ok: true, data: { user, expiresAt } }` on success
 * and `errorResponse()` with code `unauthorized` on bad
 * credentials.
 */
export async function POST(req: NextRequest) {
  try {
    const t = await getApiTranslator(req);
    const { loginSchema } = makeAuthSchemas(t);
    const body = loginSchema.parse(await req.json());
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });
    if (error || !data.session) {
      // Do not leak which side is wrong; collapse every failure
      // to the same generic 401 message. Mirrors the mapping in
      // `SupabaseAuthProvider.mapSupabaseError` so the API
      // surface and the React form stay in sync.
      throw Unauthorized('Invalid e-mail or password.');
    }
    return NextResponse.json({
      ok: true,
      data: {
        user: {
          id: data.user.id,
          email: data.user.email ?? '',
          fullName:
            (typeof data.user.user_metadata?.['full_name'] === 'string'
              ? (data.user.user_metadata['full_name'] as string)
              : typeof data.user.user_metadata?.['fullName'] === 'string'
                ? (data.user.user_metadata['fullName'] as string)
                : ''),
        },
        expiresAt: typeof data.session.expires_at === 'number'
          ? new Date(data.session.expires_at * 1000).toISOString()
          : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const signOutSchema = z.object({ scope: z.enum(['local', 'global']).default('global') });

/**
 * DELETE /api/auth – sign out.
 *
 * Sprint 8 — wired to actually clear the Supabase SSR cookies so the UI
 * reflects the signed-out state immediately. The previous stub
 * delegated the cookie work to "B2" (not yet implemented) and let
 * the browser make the cross-origin logout call to GoTrue — but the
 * application's `connect-src` CSP blocks that fetch, so the
 * in-memory session never cleared and the user remained signed in.
 *
 * We now:
 *   1. Call `supabase.auth.signOut()` on the server-side SSR client
 *      (so the refresh token is revoked at GoTrue if scope=global).
 *   2. Set `sb-<ref>-auth-token` (and its `.0` / `.1` chunked
 *      siblings) to `Max-Age=0` on the response. The browser
 *      deletes the cookies on the next render, and every RSC page
 *      that reads `auth.getUser()` afterwards returns null.
 *
 * This runs server-side, so the strict `connect-src` does not apply
 * (CSP only governs browser-initiated fetches).
 */
export async function DELETE(req: NextRequest) {
  try {
    const { scope } = signOutSchema.parse(await req.json().catch(() => ({})));
    // Use the SSR server client directly — `getAuthProvider()` returns
    // the browser-side `SupabaseAuthProvider` which is marked
    // `'use client'`, and invoking it from a Route Handler throws
    // "Attempted to call ... from the server". For server-driven
    // sign-out we go through the cookie-backed SSR client.
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope });
    if (error) throw BadRequest(error.message);

    const res = NextResponse.json({ ok: true });
    if (scope === 'global') {
      // Supabase SSR stores the JWT in `sb-<project-ref>-auth-token`
      // and chunks tokens larger than the cookie size limit into
      // `sb-<project-ref>-auth-token.0`, `.1`, …  Match all of them.
      const ref = projectRefFromSupabaseUrl(publicEnv().NEXT_PUBLIC_SUPABASE_URL);
      if (ref) {
        for (const name of [
          `sb-${ref}-auth-token`,
          `sb-${ref}-auth-token.0`,
          `sb-${ref}-auth-token.1`,
          `sb-${ref}-auth-token-code-verifier`,
        ]) {
          res.cookies.set({
            name,
            value: '',
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 0,
          });
        }
      }
    }
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Extract the project-ref segment from a Supabase URL.
 *
 *   https://ffillswcwzefhlojtnkq.supabase.co          -> "ffillswcwzefhlojtnkq"
 *   http://127.0.0.1:54321  (local Supabase CLI Kong) -> null
 *
 * Returns `null` for local dev so the cookie-name match falls
 * through (the cookies in local dev may still be cleared by the
 * browser on its own once the in-memory `auth.signOut()` resolves;
 * the `next/` redirect after the route runs is what really matters).
 */
function projectRefFromSupabaseUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return null;
    const host = u.hostname; // e.g. "ffillswcwzefhlojtnkq.supabase.co"
    const first = host.split('.')[0];
    return first && first.length > 0 ? first : null;
  } catch {
    return null;
  }
}

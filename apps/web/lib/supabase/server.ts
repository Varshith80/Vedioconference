import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '@/types/database.generated';
import { publicEnv } from '@/lib/env';

/**
 * Supabase client used in Server Components, Route Handlers, and
 * Server Actions. The session comes from the Next.js cookie
 * store.
 *
 * Build-time safe: when `generateStaticParams` or another build
 * hook runs there is no request scope, so `cookies()` throws. We
 * fall back to a no-op cookie adapter that produces an anonymous
 * client — enough for public reads guarded by RLS.
 *
 * Typed vs untyped: there are two factory functions.
 * `createSupabaseServerClient` is strictly typed against the
 * hand-maintained `Database` type. `@supabase/postgrest-js` 2.110
 * does not always round-trip through that type — queries that
 * include joins or use `.eq()` on a single-row result can fall
 * through to a `SelectQueryError` union and the typed chain
 * becomes `never`. For route handlers, where the row shape is
 * re-cast at the boundary anyway, the untyped client is the
 * pragmatic choice. RLS still enforces the read; the boundary
 * cast is the documented §3.9 pattern.
 */
export async function createSupabaseServerClient() {
  return _createServerClient<Database>();
}

/**
 * Untyped variant — same Supabase client, no `Database` generic.
 * Use this in route handlers that re-cast the row at the
 * boundary (most routes).
 */
export async function createSupabaseServerClientUntyped() {
  return _createServerClient();
}

async function _createServerClient<TDatabase = unknown>() {
  const env = publicEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-key';
  let cookieStore;
  try {
    cookieStore = await cookies();
  } catch {
    return createServerClient<TDatabase>(url, key, {
      cookies: {
        get:     () => undefined,
        set:    () => undefined,
        remove: () => undefined,
      },
    });
  }

  return createServerClient<TDatabase>(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Components cannot set cookies; ignored on purpose.
          // The middleware refreshes the session on every request.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // see above
        }
      },
    },
  });
}

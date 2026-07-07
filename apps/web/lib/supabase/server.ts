import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '@/types/database.generated';

/**
 * Supabase client used in Server Components, Route Handlers, and
 * Server Actions. The session comes from the Next.js cookie store.
 *
 * Build-time safe: when `generateStaticParams` or another build
 * hook runs there is no request scope, so `cookies()` throws. We
 * fall back to a no-op cookie adapter that produces an anonymous
 * client — enough for public reads guarded by RLS.
 */
export async function createSupabaseServerClient() {
  let cookieStore;
  try {
    cookieStore = await cookies();
  } catch {
    return createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get:     () => undefined,
          set:    () => undefined,
          remove: () => undefined,
        },
      },
    );
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  );
}

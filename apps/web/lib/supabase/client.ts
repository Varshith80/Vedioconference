'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/**
 * Supabase client used in Client Components and the browser.
 * Reads/writes the user session from cookies and refreshes the
 * JWT transparently.
 *
 * Reads its configuration from the validated `publicEnv()` —
 * never from `process.env` directly.
 *
 * Untyped by design: same rationale as
 * `createSupabaseServerClientUntyped` in `lib/supabase/server.ts`.
 * The browser is only ever called from authenticated UI flows
 * (login, dashboard, profile) where the row shape is re-cast at
 * the consumer via the `as unknown as` boundary cast (CLAUDE.md
 * §3.9). The hand-maintained `Database` type does not round-trip
 * cleanly through `@supabase/postgrest-js` 2.110.
 */
export function createSupabaseBrowserClient() {
  const env = publicEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-key',
  );
}

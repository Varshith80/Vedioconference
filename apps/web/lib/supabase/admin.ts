import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';

/**
 * Supabase admin client. Bypasses Row Level Security.
 *
 * ⚠️  Server-only. Never import this from a Client Component.
 *     The service role key is the most powerful credential in
 *     the project; treat it as a top-level secret.
 *
 * Reads both public (URL) and server (service-role key) env via
 * the validated accessors in `lib/env.ts`.
 *
 * Untyped by design: the @supabase/postgrest-js typed chain does
 * not round-trip cleanly through our hand-maintained `Database`
 * type — queries that include joins or use `.eq()` on a
 * single-row result fall through to a `SelectQueryError` union
 * and `.eq` becomes untyped. The admin client is only used from
 * webhooks and the admin refund route, where the row is re-cast
 * at the consumer anyway. RLS is bypassed (the whole point of
 * this client) so the boundary cast is documented in CLAUDE.md
 * §3.9. See `lib/supabase/server.ts` for the same pattern on
 * the RLS-respecting client.
 */
export function createSupabaseAdminClient() {
  const pub = publicEnv();
  const srv = serverEnv();

  return createClient(
    pub.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
    srv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

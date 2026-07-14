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
 *
 * Like the RLS-respecting client, this one also has a 5-second
 * fetch timeout to keep webhook handlers fast on a misconfigured
 * deployment.
 */
export function createSupabaseAdminClient() {
  const pub = publicEnv();
  const srv = serverEnv();

  const client = createClient(
    pub.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
    srv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          new Promise<Response>((resolve, reject) => {
            const t = setTimeout(
              () => reject(new Error('supabase admin fetch timed out after 5000ms')),
              5_000,
            );
            fetch(input, init)
              .then((r) => { clearTimeout(t); resolve(r); })
              .catch((e) => { clearTimeout(t); reject(e); });
          }),
      },
      // Webhook handlers and the admin refund route do not need
      // realtime; the no-op transport prevents a 10-second WS
      // connection attempt from blocking the response.
      realtime: { transport: noopRealtimeTransport },
    },
  );
  // See lib/supabase/server.ts for the rationale. The retry loop
  // would otherwise add 1s+2s+4s of backoff to every unreachable
  // webhook call.
  const rest = (client as unknown as { rest?: { retryEnabled?: boolean } } | null)?.rest;
  if (rest) rest.retryEnabled = false;
  return client;
}

const noopRealtimeTransport = class {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readonly readyState = 3;
  readonly url = '';
  readonly protocol = '';
  onopen: null = null;
  onmessage: null = null;
  onclose: null = null;
  onerror: null = null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_address: string | URL, _subprotocols?: string | string[]) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  close(_code?: number, _reason?: string): void { /* no-op */ }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void { /* no-op */ }
  addEventListener(): void { /* no-op */ }
  removeEventListener(): void { /* no-op */ }
  dispatchEvent(): boolean { return true; }
};

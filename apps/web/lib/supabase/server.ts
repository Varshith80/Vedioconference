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
 *
 * Unconfigured / unreachable: the factory never throws on
 * construction. If the env is unset, the URL falls back to
 * `http://localhost:54321`; the call will fail on the first
 * round-trip (DNS / ECONNREFUSED) and the service layer is
 * expected to catch and degrade. To avoid hanging the SSR
 * response for 30+ seconds on a misconfigured deployment, the
 * server client uses a 5-second fetch timeout — any call that
 * does not resolve within that window rejects, which the service
 * layer logs and treats as an empty result.
 */
export async function createSupabaseServerClient() {
  return _createServerClient<Database>({ timeoutMs: 5_000 });
}

/**
 * Untyped variant — same Supabase client, no `Database` generic.
 * Use this in route handlers that re-cast the row at the
 * boundary (most routes).
 */
export async function createSupabaseServerClientUntyped() {
  return _createServerClient({ timeoutMs: 5_000 });
}

async function _createServerClient<TDatabase = unknown>(opts: { timeoutMs?: number } = {}) {
  const env = publicEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-key';
  const globalFetch = opts.timeoutMs
    ? { fetch: (input: RequestInfo | URL, init: RequestInit | undefined) =>
        fetchWithTimeout(input, init, opts.timeoutMs!) }
    : undefined;
  // `postgrest-js` retries idempotent GET / HEAD / OPTIONS up to 3
  // times with 1s + 2s + 4s exponential backoff on any network
  // error. That turns a 5ms ECONNREFUSED into a 7s wait on every
  // SSR request. We disable retries at the client level by reaching
  // into the protected `rest` (PostgrestClient) field — the public
  // `db.retry` config knob does not exist on @supabase/supabase-js
  // 2.110.
  const disableRetries = (client: unknown) => {
    const c = client as { rest?: { retry?: boolean; retryEnabled?: boolean } } | null;
    if (!c?.rest) return;
    // `PostgrestClient.retry` is the field that propagates to every
    // `PostgrestBuilder` constructed by `.from(...)` — see
    // postgrest-js PostgrestClient.from(). The builder's own
    // `retryEnabled` is set from this in its constructor.
    c.rest.retry = false;
    c.rest.retryEnabled = false;
  };
  let cookieStore;
  try {
    cookieStore = await cookies();
  } catch {
    const client = createServerClient<TDatabase>(url, key, {
      cookies: {
        get:     () => undefined,
        set:    () => undefined,
        remove: () => undefined,
      },
      global: globalFetch,
      // Suppress the realtime WebSocket client entirely. Server
      // Components never subscribe to realtime channels, and the
      // default `ws://` connection attempt would block the SSR
      // response for ~10 s on a misconfigured (unreachable)
      // deployment. The no-op transport satisfies the type and
      // never opens a socket.
      realtime: { transport: NoopRealtimeTransport },
    });
    disableRetries(client);
    return client;
  }

  const client = createServerClient<TDatabase>(url, key, {
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
    global: globalFetch,
    realtime: { transport: NoopRealtimeTransport },
  });
  disableRetries(client);
  return client;
}

/**
 * No-op realtime transport. Satisfies the
 * `WebSocketLikeConstructor` type expected by
 * `@supabase/realtime-js` but never opens a connection. Server
 * Components never subscribe to realtime channels; the default
 * transport would otherwise block the SSR response for ~10 s on
 * a misconfigured (unreachable) deployment.
 */
class NoopRealtimeTransport {
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
  // Event-target methods required by phoenix / realtime-js.
  addEventListener(): void { /* no-op */ }
  removeEventListener(): void { /* no-op */ }
  dispatchEvent(): boolean { return true; }
}

function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const t = setTimeout(() => {
      // Use an AbortError-shaped rejection so postgrest-js's
      // `executeWithRetry` loop recognises it as a non-retryable
      // cancellation and re-throws immediately (it would otherwise
      // re-attempt the fetch with exponential backoff of 1s/2s/4s,
      // turning a 5ms ECONNREFUSED into a 7s wait).
      const err = new Error(`supabase fetch timed out after ${timeoutMs}ms: ${String(input).slice(0, 100)}`);
      err.name = 'AbortError';
      (err as Error & { code?: string }).code = 'ABORT_ERR';
      reject(err);
    }, timeoutMs);
    fetch(input, init)
      .then((r) => { clearTimeout(t); resolve(r); })
      .catch((e) => { clearTimeout(t); reject(e); });
  });
}

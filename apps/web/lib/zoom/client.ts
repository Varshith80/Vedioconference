import 'server-only';
import { serverEnv } from '@/lib/env';

/**
 * `lib/zoom/client.ts` — server-only Zoom Server-to-Server
 * (S2S) OAuth client.
 *
 * Why a hand-rolled client (and not the official `zoomus` SDK)
 * -----------------------------------------------------------
 * The official `zoomus` SDK is a CommonJS package that still
 * defaults to JWT auth and ships its own request layer; it has
 * not been maintained against the S2S-OAuth flow. Our S2S use
 * case is exactly one POST to `/oauth/token` plus typed wrappers
 * around `/users/{id}/meetings`, `DELETE /meetings/{id}` and
 * `PATCH /meetings/{id}`. The official REST docs are the
 * source of truth, and `fetch` is enough.
 *
 * The token is cached in-process until 60 s before expiry. A
 * Vercel cold start triggers a refresh; concurrent cold starts
 * may issue parallel refreshes, which is harmless — Zoom's token
 * endpoint is rate-limited at ~100 req/s, far above our traffic.
 */

const TOKEN_URL = 'https://zoom.us/oauth/token';
const API_BASE  = 'https://api.zoom.us/v2';

interface CachedToken {
  accessToken: string;
  /** Epoch ms when the token expires. */
  expiresAt:   number;
}

let _cached: CachedToken | null = null;
let _inflight: Promise<CachedToken> | null = null;

/**
 * Read a server-to-server access token, refreshing lazily.
 *
 * The S2S flow is the standard OAuth 2.0 client-credentials
 * grant: `POST /oauth/token` with the 3 creds in the body
 * (form-encoded), no refresh token (the credentials *are* the
 * long-lived secret).
 */
export async function getZoomAccessToken(): Promise<string> {
  const env = serverEnv();
  if (!env.ZOOM_ACCOUNT_ID || !env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
    throw new Error('Zoom S2S credentials are not configured.');
  }
  const now = Date.now();
  if (_cached && _cached.expiresAt - 60_000 > now) {
    return _cached.accessToken;
  }
  if (_inflight) return (await _inflight).accessToken;

  _inflight = (async (): Promise<CachedToken> => {
    const params = new URLSearchParams({
      grant_type:    'account_credentials',
      account_id:    env.ZOOM_ACCOUNT_ID!,
      client_id:     env.ZOOM_CLIENT_ID!,
      client_secret: env.ZOOM_CLIENT_SECRET!,
    });
    const res = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      _inflight = null;
      throw new Error(`Zoom S2S token request failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    const token: CachedToken = {
      accessToken: json.access_token,
      expiresAt:   Date.now() + json.expires_in * 1000,
    };
    _cached    = token;
    _inflight  = null;
    return token;
  })();
  return (await _inflight).accessToken;
}

/**
 * Internal — perform a Zoom REST call with a fresh bearer token.
 * Throws with a useful error message on non-2xx responses.
 */
export async function zoomFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getZoomAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept:        'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoom ${init.method ?? 'GET'} ${path} failed (${res.status}): ${text}`);
  }
  // Some Zoom endpoints (DELETE) return 204 — caller may pass
  // a void type.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

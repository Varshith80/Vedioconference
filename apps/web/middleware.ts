import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { locales, defaultLocale, type Locale } from '@/i18n';
import { publicEnv } from '@/lib/env';

/**
 * Next.js middleware.
 *
 * Composition (order matters):
 *  1. next-intl: canonicalises the locale (negotiates Accept-Language,
 *     persists the `NEXT_LOCALE` cookie, redirects `/` → `/en` by
 *     default, leaves `/api/*` alone because the matcher excludes it).
 *  2. Supabase SSR: refreshes the session cookie on the same response
 *     so locale cookies and auth cookies are merged into one Set-Cookie
 *     chain.
 *  3. Protected-route guard: anonymous visitors to `/<locale>/dashboard`
 *     or `/<locale>/admin` are redirected to the locale-appropriate
 *     `/auth/login?next=<original-path>`.
 *
 * `/api/*` is excluded from the matcher entirely, so route handlers
 * never see next-intl rewriting and never see the protected-route
 * guard. API routes are language-agnostic and read their own locale
 * (when they need one) from the `Accept-Language` header.
 */
const intl = createIntlMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: 'always',
  localeDetection: true,
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
  },
});

export async function middleware(request: NextRequest) {
  // 1. Locale handling (also handles the root `/` redirect).
  const intlResponse = intl(request);

  // 2. Supabase session refresh. We mutate the same `intlResponse`
  //    so cookies from both layers end up in one response.
  //    The 3-second fetch timeout mirrors `lib/supabase/server.ts`
  //    so the middleware never blocks the response on an
  //    unreachable Supabase.
  const env = publicEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-key',
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          intlResponse.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          intlResponse.cookies.set({ name, value: '', ...options });
        },
      },
      global: {
        fetch: (input: RequestInfo | URL, init: RequestInit | undefined) =>
          new Promise<Response>((resolve, reject) => {
            const t = setTimeout(() => {
              // See lib/supabase/server.ts — AbortError shape makes
              // postgrest-js skip its 1s/2s/4s retry loop.
              const err = new Error('supabase middleware fetch timed out after 3000ms');
              err.name = 'AbortError';
              (err as Error & { code?: string }).code = 'ABORT_ERR';
              reject(err);
            }, 3_000);
            fetch(input, init)
              .then((r) => { clearTimeout(t); resolve(r); })
              .catch((e) => { clearTimeout(t); reject(e); });
          }),
      },
      realtime: { transport: noopRealtimeTransport },
    },
  );
  // Disable postgrest-js's GET retry loop. See
  // lib/supabase/server.ts for the full rationale — without this
  // patch, an ECONNREFUSED on the auth endpoint becomes 7s of
  // backoff (1s+2s+4s) instead of a near-instant failure.
  const rest = (supabase as unknown as { rest?: { retryEnabled?: boolean } } | null)?.rest;
  if (rest) rest.retryEnabled = false;

  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    // The Supabase auth call is best-effort in middleware. On a
    // misconfigured deployment the request still gets a chance
    // to reach the page, where `requireUser` / `requireProfile`
    // will run the same check server-side and produce the
    // correct redirect.
    user = null;
  }
  const { pathname } = request.nextUrl;

  // 3. Protected-route check on the locale-prefixed paths. Both
  //    `/en/dashboard/*` and `/fr/dashboard/*` are protected.
  const isProtected =
    /^\/(?:en|fr)\/dashboard(?:\/|$)/.test(pathname) ||
    /^\/(?:en|fr)\/admin(?:\/|$)/.test(pathname);

  if (isProtected && !user) {
    const localeMatch = pathname.match(/^\/(en|fr)/);
    const locale: Locale = (localeMatch?.[1] as Locale | undefined) ?? defaultLocale;
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/auth/login`;
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return intlResponse;
}

export const config = {
  matcher: [
    // Skip API routes (language-agnostic), Next.js internals, and static
    // assets. Everything else flows through next-intl + Supabase.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

/**
 * No-op realtime transport. Same shape as the class in
 * `lib/supabase/server.ts` but duplicated here because the
 * middleware runs in the edge runtime and cannot import
 * `lib/supabase/server.ts` (which uses `import 'server-only'`).
 * Server Components never subscribe to realtime channels; the
 * default `ws://` connection attempt would otherwise block the
 * SSR response for ~10 s on a misconfigured (unreachable)
 * deployment.
 */
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
  // Event-target methods required by phoenix / realtime-js.
  addEventListener(): void { /* no-op */ }
  removeEventListener(): void { /* no-op */ }
  dispatchEvent(): boolean { return true; }
};

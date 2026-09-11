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
  const { pathname } = request.nextUrl;

  // 0. Bypass the dev-overlay polling paths. The Next.js 15.0.x
  //    dev error overlay polls two stack-frame endpoints on every
  //    error: `/__nextjs_original-stack-frames?…` (plural, the
  //    bundle-side lookup) and `/__nextjs_original-stack-frame?…`
  //    (singular, a newer dev-overlay endpoint added in 15.0.0).
  //    The dev server returns 404 for both because dev source maps
  //    are not emitted alongside the bundle (production has them,
  //    dev does not). If we let next-intl see this path it
  //    307-redirects to `/en/__nextjs_original-stack-frames` (a
  //    404) and the dev overlay's Network tab fills with 404s.
  //
  //    The plural path is rewired in `next.config.mjs` to
  //    `/dev-stack-frames-stub`. The singular path, however, is
  //    intercepted by Next.js's built-in dev-overlay handler
  //    BEFORE the rewrite fires, and that built-in handler
  //    returns 400 for query shapes the dev overlay actually
  //    uses (e.g. `?lineNumber=…&columnNumber=…` without a
  //    `file` parameter). The result is a 400 chain in F12.
  //
  //    We short-circuit both paths here with a 204 No Content.
  //    The dev overlay treats 204 as "no remap available" and
  //    falls back to the post-transform JS stack — the same
  //    stack the user would see in production.
  //
  //    `/favicon.ico` is no longer handled here: the matcher
  //    below excludes it so the request never reaches the
  //    middleware. The App Router will serve the file from
  //    `public/` (we ship `favicon.svg`, not `.ico`).
  //    `manifest.json` and `apple-touch-icon.png` are likewise
  //    matcher-excluded; their 204 stubs live at
  //    `app/manifest.json/route.ts` and
  //    `app/apple-touch-icon.png/route.ts`. The matcher-level
  //    exclusion is what stops the next-intl 307-redirect to a
  //    locale-prefixed path that 404s.
  if (
    pathname === '/__nextjs_original-stack-frames' ||
    pathname === '/__nextjs_original-stack-frame'
  ) {
    return new NextResponse(null, { status: 204 });
  }

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

  // 3. Protected-route check on the locale-prefixed paths. Both
  //    `/en/dashboard/*` and `/fr/dashboard/*` are protected.
  const isProtected =
    /^\/(?:en|fr)\/dashboard(?:\/|$)/.test(pathname) ||
    /^\/(?:en|fr)\/admin(?:\/|$)/.test(pathname);

  // 3a. Resolve the active locale for redirect targets. We
  //     re-derive it from the URL prefix (same logic the layout
  //     uses) so the middleware never depends on the request
  //     header that next-intl mutates downstream.
  const localeMatch = pathname.match(/^\/(en|fr)/);
  const activeLocale: Locale =
    (localeMatch?.[1] as Locale | undefined) ?? defaultLocale;

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = `/${activeLocale}/auth/login`;
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // 3b. Admin role-guard. The previous design lived inside the
  //     dashboard RSC layout (`app/[locale]/dashboard/layout.tsx`)
  //     and called `redirect(...)` from a Server Component when
  //     the signed-in user had `role === 'admin' | 'super_admin'`.
  //     Next 15 + React 19 surface that thrown `NEXT_REDIRECT` as
  //     a dev-overlay console error before the actual navigation
  //     completes (see Sprint 3.7 / commit b5e44f0 follow-up).
  //     Doing the same redirect here — as a real 307 from
  //     `NextResponse.redirect` — is silent, idempotent, and
  //     keeps the dev console clean.
  //
  //     The dashboard layout keeps `requireProfile()` as a
  //     defense-in-depth fallback for routes that bypass the
  //     middleware (e.g. a custom deployment without the matcher),
  //     but with the role-mismatch redirect removed: by the time
  //     the layout runs, the middleware has already moved the
  //     admin to `/admin`, so the only role-mismatch the layout
  //     can see is "anonymous" — which `requireProfile` already
  //     handles by redirecting to /auth/login.
  if (
    user &&
    new RegExp(`^/${activeLocale}/dashboard(?:/|$)`).test(pathname)
  ) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      const role = (profile as { role?: string } | null)?.role;
      if (role === 'admin' || role === 'super_admin') {
        const url = request.nextUrl.clone();
        url.pathname = `/${activeLocale}/admin`;
        return NextResponse.redirect(url);
      }
    } catch {
      // Best-effort: if the profile read fails the layout's
      // requireProfile() will still produce the correct redirect.
    }
  }

  return intlResponse;
}

export const config = {
  matcher: [
    // Skip API routes (language-agnostic), Next.js internals, and
    // static assets. The metadata-file probes (robots.txt,
    // sitemap.xml, manifest.json, apple-touch-icon.png,
    // favicon.ico) are explicitly listed in the negative
    // lookahead too: the App Router registers `app/robots.ts`
    // and `app/sitemap.ts` at the root (NOT under /en/ or /fr/),
    // so letting next-intl's matcher see those paths produces a
    // 307 → /<locale>/robots.txt → 404 chain in F12 every time a
    // browser or crawler probes them. We exclude them at the
    // matcher level so the App Router route handler serves them
    // directly. The same applies to manifest.json and
    // apple-touch-icon.png — we don't ship those, and a 404 from
    // a real route handler is cleaner than a 307 → 404.
    '/((?!api|_next/static|_next/image|robots\\.txt|sitemap\\.xml|manifest\\.json|apple-touch-icon\\.png|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
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

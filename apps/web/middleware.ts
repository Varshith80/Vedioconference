import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { locales, defaultLocale, type Locale } from '@/i18n';
import type { Database } from '@/types/database.generated';

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
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
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

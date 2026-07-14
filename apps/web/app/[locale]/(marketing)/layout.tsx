import * as React from 'react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/services/auth';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { getFooterLinks } from '@/lib/i18n/nav';

/**
 * Marketing layout. RSC. Fetches the user exactly once per request
 * (React's `cache()` inside `getCurrentUser`) and passes the auth
 * state to the header. `revalidate = 60` makes the marketing pages
 * eligible for the Vercel edge cache, producing the equivalent of
 * `Cache-Control: s-maxage=60, stale-while-revalidate=600`.
 *
 * The localised strings (skip link, footer links) come from the
 * active locale's message file; the actual chrome components
 * (`SiteHeader`, `SiteFooter`) are presentational and receive
 * their data through props.
 */
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const tNav = await getTranslations({ locale, namespace: 'Nav' });
  return {
    openGraph: { type: 'website', locale: locale === 'fr' ? 'fr_FR' : 'en_US' },
    twitter: { card: 'summary_large_image' },
    alternates: { languages: { 'x-default': '/en' } },
    other: { 'x-skip-link': tNav('skipLink') },
  };
}

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const tNav = await getTranslations('Nav');
  const links = getFooterLinks(tNav);
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a href="#main" className="skip-link">
        {tNav('skipLink')}
      </a>
      {/*
        Suspense boundary around <SiteHeader />: SiteHeader renders
        <LanguageSwitcher />, which is a client component that calls
        usePathname() + useRouter() + useLocale(). In Next 15 +
        React 19, those hooks trigger the CSR-bailout path
        (useDynamicRouteParams('usePathname()') in
        next/dist/client/components/navigation.js) and the client
        next-intl hooks call React 19's use() on the messages
        promise. Without a Suspense boundary, the streamed tree
        bails out of partial pre-rendering and React tries to
        hydrate with the fallback as the root. The hydration
        mismatch on the <html>/<body> subtree then cascades into
        HierarchyRequestError and NotFoundError: removeChild. The
        same fix was already applied to /auth/login and
        /auth/reset-password; this layout owns the marketing tree
        and needs the same protection.
      */}
      <Suspense fallback={null}>
        <SiteHeader isAuthenticated={Boolean(user)} userLabel={null} />
      </Suspense>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter links={links} />
    </div>
  );
}

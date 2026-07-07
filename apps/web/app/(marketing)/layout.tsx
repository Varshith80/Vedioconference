import * as React from 'react';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/services/auth';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

/**
 * Marketing layout. RSC. Fetches the user exactly once per request
 * (React's `cache()` inside `getCurrentUser`) and passes the auth
 * state to the header. `revalidate = 60` makes the marketing pages
 * eligible for the Vercel edge cache, producing the equivalent of
 * `Cache-Control: s-maxage=60, stale-while-revalidate=600`.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  openGraph: { type: 'website', locale: 'fr_FR' },
  twitter: { card: 'summary_large_image' },
};

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a href="#main" className="skip-link">
        Aller au contenu principal
      </a>
      <SiteHeader isAuthenticated={Boolean(user)} userLabel={null} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

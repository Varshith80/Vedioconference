'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { AuthProvider } from '@/services/auth/auth-react-provider';
import { useAuth } from '@/services/auth/use-auth';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { DashboardTopNav } from '@/components/dashboard/top-nav';
import { DashboardHeader } from '@/components/dashboard/header';

/**
 * Client-side layout for every page under `/[locale]/dashboard/*`.
 * Wraps the tree in `<AuthProvider>` and redirects to the
 * locale-aware `/auth/login` when the user is not signed in.
 * Renders the sidebar (>= md) and the top nav (< md) on every
 * page.
 *
 * The redirect is intentionally client-side in B1: the B1 stub
 * does not write any HTTP cookie so a server-side
 * `getCurrentUser` would always see "signed out" and bounce
 * every request. B2 will flip this back to a server-side check
 * that reads the Supabase session cookie.
 */
export function DashboardClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('Dashboard');

  React.useEffect(() => {
    if (auth.status === 'unauthenticated') {
      router.replace(`/${locale}/auth/login?next=/${locale}/dashboard`);
    }
  }, [auth.status, router, locale]);

  if (auth.status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground"
      >
        {t('loading')}
      </div>
    );
  }
  if (auth.status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader />
        <DashboardTopNav />
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

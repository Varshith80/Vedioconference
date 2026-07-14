'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { AuthProvider } from '@/services/auth/auth-react-provider';
import { useAuth } from '@/services/auth/use-auth';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { AdminHeader } from '@/components/admin/admin-header';

// Client-side layout for every page under `/[locale]/admin/*`.
// Mirrors DashboardClientLayout: wraps the tree in
// `<AuthProvider>` and redirects to the locale-aware
// `/auth/login` when the user is not signed in. The admin
// role check itself runs server-side in the `admin/layout.tsx`
// via `requireAdmin()`; this client wrapper is the visual
// shell (Sprint 3.6 §4.3).
export function AdminClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminShell>{children}</AdminShell>
    </AuthProvider>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('Admin');

  React.useEffect(() => {
    if (auth.status === 'unauthenticated') {
      router.replace(`/${locale}/auth/login?next=/${locale}/admin`);
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
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader />
        <AdminTopNav />
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

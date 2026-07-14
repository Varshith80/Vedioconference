import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/hooks/use-require-user';
import { isLocale } from '@/i18n';
import { AdminClientLayout } from '@/components/admin/admin-client-layout';

// Sprint 3.6: the admin layout reads the auth context
// (requireAdmin -> Supabase session cookie) which is
// request-scoped, so opt out of static generation. The
// `<Suspense>` boundary is the same Next 15 + React 19
// pattern used in the dashboard layout: the client
// components (AdminSidebar, AdminTopNav, AdminHeader) call
// usePathname() / useLocale() and trigger the CSR-bailout
// path; the boundary contains the bailout so the surrounding
// RSC tree stays stable (see DashboardLayout for the same
// comment block, sprint B1-i18n chunk 5).
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    // The middleware already redirects non-locale prefixes
    // but a defensive guard here keeps the layout safe if
    // called from a route that bypasses the middleware.
    return null;
  }
  setRequestLocale(locale);

  // Authoritative admin gate. requireAdmin() redirects
  // anonymous users to /auth/login and signed-in non-admins
  // to /dashboard?error=forbidden. The DB is_admin() RPC
  // remains the security boundary; this guard is a UX
  // redirect (CLAUDE.md §3.7 + Sprint 3.6 §4.1).
  await requireAdmin();

  return (
    <Suspense fallback={null}>
      <AdminClientLayout>{children}</AdminClientLayout>
    </Suspense>
  );
}

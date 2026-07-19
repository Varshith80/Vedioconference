import * as React from 'react';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { DashboardClientLayout } from '@/components/dashboard/dashboard-client-layout';
import { requireProfile } from '@/hooks/use-require-user';
import { isLocale } from '@/i18n';

// B1 placeholder: opt out of static generation because the
// dashboard reads the auth context which is request-scoped.
export const dynamic = 'force-dynamic';

/**
 * The dashboard tree is built from client components that all call
 * usePathname() / useRouter() / useLocale() (DashboardShell,
 * DashboardSidebar, DashboardTopNav, DashboardHeader). In Next 15
 * + React 19 those hooks trigger the CSR-bailout path
 * (useDynamicRouteParams('usePathname()') in
 * next/dist/client/components/navigation.js) and the client
 * next-intl hooks call React 19's use() on the messages promise.
 * Without a Suspense boundary, the streamed tree bails out of
 * partial pre-rendering and React tries to hydrate the root with
 * a Fragment as the first child. The hydration mismatch on the
 * <html>/<body> subtree cascades into HierarchyRequestError and
 * NotFoundError: removeChild. The boundary contains the bailout
 * so the surrounding RSC tree stays stable.
 *
 * Sprint 3.7 — server-side role guard
 * -----------------------------------
 * If a user with the `admin` or `super_admin` role lands on
 * /dashboard (e.g. via a stale bookmark, a deep link, or — in
 * the past — because the post-login redirect raced and sent the
 * admin here), we promote them to /admin on the **server**,
 * before any client component is rendered. This is the
 * defense-in-depth layer behind the new `loginAction` Server
 * Action: even if some other path leaves an admin on
 * /dashboard, the layout will catch it and redirect.
 *
 * Why this also fixes the `NEXT_REDIRECT inside AdminLayout`
 * log: the admin sidebar/top-nav `Link` components prefetch
 * with `prefetch={true}` (the default). When an admin is on
 * /dashboard, the dashboard layout runs first; this server-side
 * role check fires and redirects the user to /admin before the
 * prefetched AdminLayout RSC tree has a chance to be rendered
 * and throw its own `requireAdmin()` redirect.
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    // The middleware already redirects non-locale prefixes but
    // a defensive guard here keeps the layout safe if called
    // from a route that bypasses the middleware.
    return null;
  }
  setRequestLocale(locale);

  // Defense-in-depth role guard. `requireProfile()` returns
  // the profile row and only `redirect()`s for anonymous
  // users. We then check the role ourselves so we can pick
  // the correct destination (admin → /admin, student → stay
  // on /dashboard). The same role check lives in the admin
  // layout; doing it here too is the only way to keep an
  // admin from ever rendering the student dashboard tree.
  const profile = await requireProfile();
  if (profile.role === 'admin' || profile.role === 'super_admin') {
    redirect(`/${locale}/admin`);
  }

  return (
    <Suspense fallback={null}>
      <DashboardClientLayout>{children}</DashboardClientLayout>
    </Suspense>
  );
}

import * as React from 'react';
import { Suspense } from 'react';
import { DashboardClientLayout } from '@/components/dashboard/dashboard-client-layout';

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
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <DashboardClientLayout>{children}</DashboardClientLayout>
    </Suspense>
  );
}

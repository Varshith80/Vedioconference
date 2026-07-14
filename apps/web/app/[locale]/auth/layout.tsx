import * as React from 'react';
import { Suspense } from 'react';
import { AuthClientLayout } from '@/components/auth/auth-client-layout';

// B1 placeholder: opt out of static generation because the auth
// tree reads the auth context which is request-scoped.
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // AuthClientLayout is a 'use client' component that calls
  // `useTranslations` (React 19's `use()` on the messages promise)
  // and renders <LanguageSwitcher> (which calls `usePathname` +
  // `useRouter` + `useLocale`). This is the same pattern as the
  // 4 other client components wrapped in Suspense in Sprint 1
  // (SiteHeader, DashboardClientLayout, RegisterForm,
  // ForgotPasswordForm). Wrapping it in a Suspense boundary
  // prevents the CSR-bailout path (useDynamicRouteParams) from
  // bailing the layout's subtree out of partial pre-rendering.
  // Without this boundary, the tree bails out of partial
  // pre-rendering and React tries to hydrate with a Fragment as
  // the root, producing the same `Hydration failed: server sent
  // <html> but client expected <Suspense fallback={<Fragment>}>` mismatch
  // on locale switch and hard refresh of /auth/* routes.
  return (
    <Suspense fallback={null}>
      <AuthClientLayout>{children}</AuthClientLayout>
    </Suspense>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LoginForm } from '@/components/forms/login-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.login' });
  return {
    title: t('h1'),
    description: t('fallbackError'),
    alternates: { canonical: `/${locale}/auth/login` },
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // The LoginForm uses `useSearchParams` to read `?next=`. In
  // Next.js 15 + React 19, any client component that reads search
  // params must be wrapped in a Suspense boundary — otherwise the
  // tree bails out of partial pre-rendering and React tries to
  // hydrate with a Fragment as the root, producing the
  // `Hydration failed: server sent <html> but client expected
  // <Suspense fallback={<Fragment>}>` mismatch that cascades
  // into `HierarchyRequestError: <div> cannot be a child of
  // <#document>` and `NotFoundError: Failed to execute
  // 'removeChild' on 'Node'` on locale switch and hard refresh.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

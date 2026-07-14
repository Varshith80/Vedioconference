import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ForgotPasswordForm } from '@/components/forms/forgot-password-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.forgotPassword' });
  return {
    title: t('h1'),
    description: t('intro'),
    alternates: { canonical: `/${locale}/auth/forgot-password` },
    robots: { index: false, follow: false },
  };
}

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // ForgotPasswordForm is a client component that calls
  // useLocale() (and through it, React 19's use() on the messages
  // promise). In Next 15 + React 19 the client next-intl hook
  // triggers the CSR-bailout path. Without a Suspense boundary,
  // the streamed tree bails out of partial pre-rendering and
  // React tries to hydrate the root with a Fragment as the first
  // child, producing the "server sent <html> but client expected
  // <Suspense fallback={<Fragment>}>" mismatch that cascades into
  // HierarchyRequestError and NotFoundError: removeChild. The
  // /auth/login and /auth/reset-password pages already carry this
  // fix; the sibling auth pages need the same protection.
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}

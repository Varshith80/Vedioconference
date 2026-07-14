import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RegisterForm } from '@/components/forms/register-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.register' });
  return {
    title: t('h1'),
    description: t('fallbackError'),
    alternates: { canonical: `/${locale}/auth/register` },
    robots: { index: false, follow: false },
  };
}

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // RegisterForm is a client component that calls useRouter() and
  // useLocale(). In Next 15 + React 19 those hooks trigger the
  // CSR-bailout path (useDynamicRouteParams) and the client
  // next-intl hooks call React 19's use() on the messages
  // promise. Without a Suspense boundary, the streamed tree bails
  // out of partial pre-rendering and React tries to hydrate the
  // root with a Fragment as the first child, producing the
  // "server sent <html> but client expected <Suspense
  // fallback={<Fragment>}>" mismatch that cascades into
  // HierarchyRequestError and NotFoundError: removeChild. The
  // /auth/login and /auth/reset-password pages already carry this
  // fix; the sibling auth pages need the same protection.
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

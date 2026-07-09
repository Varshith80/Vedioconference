import type { Metadata } from 'next';
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
  return <LoginForm />;
}

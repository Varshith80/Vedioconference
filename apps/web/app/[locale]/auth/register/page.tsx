import type { Metadata } from 'next';
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
  return <RegisterForm />;
}

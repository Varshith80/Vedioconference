import type { Metadata } from 'next';
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
  return <ForgotPasswordForm />;
}

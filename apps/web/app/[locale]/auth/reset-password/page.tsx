import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { ResetPasswordForm } from '@/components/forms/reset-password-form';
import { BRAND } from '@/lib/constants/brand';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.resetPassword' });
  return {
    title: `${t('h1')} — ${BRAND.name}`,
    description: t('intro'),
    alternates: { canonical: `/${locale}/auth/reset-password` },
    robots: { index: false, follow: false },
  };
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Auth.resetPassword');
  return (
    <Section spacing="default" aria-labelledby="reset-title">
      <Container>
        <div className="flex min-h-[60vh] items-center justify-center py-8">
          <div>
            <h1 id="reset-title" className="sr-only">
              {t('h1')}
            </h1>
            <Suspense fallback={null}>
              <ResetPasswordForm />
            </Suspense>
          </div>
        </div>
      </Container>
    </Section>
  );
}

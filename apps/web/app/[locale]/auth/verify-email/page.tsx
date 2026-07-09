import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/lib/constants/brand';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.verifyEmail' });
  return {
    title: `${t('h1')} — ${BRAND.name}`,
    description: t('intro'),
    alternates: { canonical: `/${locale}/auth/verify-email` },
    robots: { index: false, follow: false },
  };
}

/**
 * Verify-email landing. The user lands here after sign-up. The
 * transactional e-mail (sent via Resend + n8n) carries a magic
 * link with a one-time code; B2 will land them on a callback
 * route that finishes the verification and redirects to the
 * dashboard.
 */
export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Auth.verifyEmail');
  return (
    <Section spacing="default" aria-labelledby="verify-title">
      <Container>
        <div className="flex min-h-[60vh] items-center justify-center py-8">
          <div className="w-full max-w-md text-center">
            <div
              aria-hidden="true"
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--brand-accent)]/10 text-[color:var(--brand-accent)]"
            >
              <Mail className="h-6 w-6" />
            </div>
            <h1
              id="verify-title"
              className="mt-4 font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              {t('h1')}
            </h1>
            <p className="mt-3 text-pretty text-sm text-muted-foreground sm:text-base">
              {t('body')}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {t.rich('spam', {
                retry: (chunks) => (
                  <Link href={`/${locale}/auth/register`} className="underline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
            <div className="mt-6">
              <Button asChild variant="outline">
                <Link href={`/${locale}`}>{t('backHome')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}

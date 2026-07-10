import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { BRAND } from '@/lib/constants/brand';
import { CircleCheck } from 'lucide-react';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: `Payment received — ${BRAND.name}`,
    description: 'Your payment was received. The course is now active in your dashboard.',
    alternates: { canonical: `/${locale}/checkout/success` },
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ enrollment_id?: string }>;
}) {
  const { locale } = await params;
  const { enrollment_id } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('Checkout.success');

  return (
    <Section spacing="default" aria-labelledby="success-title">
      <Container className="max-w-2xl">
        <div className="mt-10 flex flex-col items-center text-center">
          <CircleCheck className="h-12 w-12 text-emerald-600" aria-hidden={true} />
          <Heading id="success-title" level="h1" className="mt-4 text-3xl sm:text-4xl">
            {t('title')}
          </Heading>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            {t('description')}
          </p>
          {enrollment_id ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('enrollmentId')}: <code>{enrollment_id}</code>
            </p>
          ) : null}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={enrollment_id
                ? `/${locale}/dashboard/courses/${enrollment_id}`
                : `/${locale}/dashboard`}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('goToDashboard')}
            </Link>
            <Link
              href={`/${locale}/courses`}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('browseMore')}
            </Link>
          </div>
        </div>
      </Container>
    </Section>
  );
}

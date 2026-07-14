import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { BRAND } from '@/lib/constants/brand';
import { CircleAlert } from 'lucide-react';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: `Payment cancelled — ${BRAND.name}`,
    description: 'Your payment was cancelled. No charge was made.',
    alternates: { canonical: `/${locale}/checkout/cancel` },
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

export default async function CheckoutCancelPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ enrollment_id?: string }>;
}) {
  const { locale } = await params;
  const { enrollment_id } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('Checkout.cancel');

  return (
    <Section spacing="default" aria-labelledby="cancel-title">
      <Container className="max-w-2xl">
        <div className="mt-10 flex flex-col items-center text-center">
          <CircleAlert className="h-12 w-12 text-amber-500" aria-hidden={true} />
          <Heading id="cancel-title" level="h1" className="mt-4 text-3xl sm:text-4xl">
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
            {enrollment_id ? (
              <Link
                href={`/${locale}/checkout/enrollment/${enrollment_id}`}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('retry')}
              </Link>
            ) : null}
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

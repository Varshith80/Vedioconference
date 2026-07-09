import type { Metadata } from 'next';
import { CalendarRange } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { EmptyState } from '@/components/shared/empty-state';
import { BRAND } from '@/lib/constants/brand';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Dashboard.bookings' });
  return {
    title: `${t('title')} — ${BRAND.name}`,
    description: t('subline'),
    alternates: { canonical: `/${locale}/dashboard/bookings` },
    robots: { index: false, follow: false },
  };
}

// B1: this is a placeholder shell — the B2 sprint will replace
// it with the real Supabase-backed list.
export const dynamic = 'force-dynamic';

export default async function DashboardBookingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.bookings');
  const tNav = await getTranslations('Nav');
  return (
    <Section spacing="default" aria-labelledby="bookings-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: tNav('breadcrumbs.home'), href: '/' },
            { label: tNav('breadcrumbs.dashboard'), href: `/${locale}/dashboard` },
            { label: t('title') },
          ]}
        />
        <div className="mt-3">
          <Heading id="bookings-title" level="h1" className="text-3xl sm:text-4xl">
            {t('title')}
          </Heading>
          <p className="mt-2 text-base text-muted-foreground">
            {t('subline')}
          </p>
        </div>

        <div className="mt-10">
          <EmptyState
            icon={<CalendarRange className="h-6 w-6" aria-hidden={true} />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        </div>
      </Container>
    </Section>
  );
}

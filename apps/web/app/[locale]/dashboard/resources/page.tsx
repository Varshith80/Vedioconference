import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { EmptyState } from '@/components/shared/empty-state';
import { BookOpen } from 'lucide-react';
import { BRAND } from '@/lib/constants/brand';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Dashboard.resources' });
  return {
    title: `${t('title')} — ${BRAND.name}`,
    description: t('subline'),
    alternates: { canonical: `/${locale}/dashboard/resources` },
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

export default async function DashboardResourcesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.resources');
  const tNav = await getTranslations('Nav');
  return (
    <Section spacing="default" aria-labelledby="resources-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: tNav('breadcrumbs.home'), href: '/' },
            { label: tNav('breadcrumbs.dashboard'), href: `/${locale}/dashboard` },
            { label: t('title') },
          ]}
        />
        <div className="mt-3">
          <Heading id="resources-title" level="h1" className="text-3xl sm:text-4xl">
            {t('title')}
          </Heading>
          <p className="mt-2 text-base text-muted-foreground">
            {t('subline')}
          </p>
        </div>

        <div className="mt-10">
          <EmptyState
            icon={<BookOpen className="h-6 w-6" aria-hidden={true} />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        </div>
      </Container>
    </Section>
  );
}

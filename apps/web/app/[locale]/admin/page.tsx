import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/hooks/use-require-user';
import { isLocale } from '@/i18n';
import { getOverviewCounters } from '@/services/admin/overview';
import { OverviewCounters } from '@/components/admin/overview-counters';

// The admin overview page is a server component. It runs
// the same `getOverviewCounters()` service that backs the
// /api/admin/overview route, so the RSC render and the JSON
// API are always in sync (Sprint 3.6 §4.2 + §4.4).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.overview' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);

  // The admin gate already runs in the layout, but call
  // requireAdmin() here too so the page can be used in a
  // preview / link-check context where the layout is
  // bypassed. cache() makes the round-trip free.
  await requireAdmin();

  const t = await getTranslations('Admin.overview');
  const counters = await getOverviewCounters();

  return (
    <div className="container py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('subline')}</p>
      </header>
      <OverviewCounters counters={counters} />
    </div>
  );
}

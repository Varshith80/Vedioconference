import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin' });
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
  setRequestLocale(locale);
  const t = await getTranslations('Admin');
  return (
    <main className="container py-12">
      <h1 className="text-3xl font-bold">{t('h1')}</h1>
      <p className="mt-2 text-muted-foreground">{t('subline')}</p>
    </main>
  );
}

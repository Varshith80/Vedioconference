import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { ImportExcelForm } from '@/components/admin/import-excel-form';

// =====================================================================
// Sprint 3.6 §5.7 — /admin/import page. Server component.
// Calls requireAdmin() defensively (the layout already does,
// but the page can be linked from a marketing email or a
// pre-rendered preview). Renders <ImportExcelForm/> in the
// admin chrome inherited from the layout.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.import' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin/import` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminImportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) return <></>;
  setRequestLocale(locale);

  // Defensive gate (layout calls requireAdmin() too).
  await requireAdmin();

  return (
    <div className="container py-8 sm:py-12">
      <ImportExcelForm />
    </div>
  );
}

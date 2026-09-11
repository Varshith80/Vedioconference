import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getProgramById } from '@/services/admin/catalog';
import { ProgramEditForm } from '@/components/admin/program-edit-form';

// =====================================================================
// Sprint 3.8 — /admin/programs/[id] (edit page).
// Mirrors the /admin/sessions/[id] page (Sprint 3.6 §4.5).
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.programEdit' });
  return {
    title: `${t('title')} — CoursEnLigne`,
    alternates: { canonical: `/${locale}/admin/programs` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminProgramEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return <></>;
  setRequestLocale(locale);
  await requireAdmin();

  const row = await getProgramById(id);
  if (!row) notFound();

  const initial = {
    title: typeof row.title === 'string' ? row.title : '',
    slug: typeof row.slug === 'string' ? row.slug : '',
    description: typeof row.description === 'string' ? (row.description as string) : null,
    sort_order: typeof row.sort_order === 'number' ? (row.sort_order as number) : 0,
    is_published: Boolean(row.is_published),
  };

  return (
    <div className="container py-8 sm:py-12">
      <ProgramEditForm programId={id} initial={initial} />
    </div>
  );
}

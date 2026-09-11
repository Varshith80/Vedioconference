import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllPrograms, getGradeById } from '@/services/admin/catalog';
import { GradeEditForm } from '@/components/admin/grade-edit-form';

// =====================================================================
// Sprint 3.8 — /admin/grades/[id] (edit page).
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.gradeEdit' });
  return {
    title: `${t('title')} — CoursEnLigne`,
    alternates: { canonical: `/${locale}/admin/grades` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminGradeEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return <></>;
  setRequestLocale(locale);
  await requireAdmin();

  const [row, programs] = await Promise.all([getGradeById(id), getAllPrograms()]);
  if (!row) notFound();

  const programSlug = (() => {
    const pid = row.program_id as string | undefined;
    return programs.find((p) => p.id === pid)?.slug ?? '';
  })();

  const initial = {
    title: typeof row.title === 'string' ? row.title : '',
    slug: typeof row.slug === 'string' ? row.slug : '',
    program_slug: programSlug,
    sort_order: typeof row.sort_order === 'number' ? (row.sort_order as number) : 0,
  };

  return (
    <div className="container py-8 sm:py-12">
      <GradeEditForm gradeId={id} initial={initial} />
    </div>
  );
}

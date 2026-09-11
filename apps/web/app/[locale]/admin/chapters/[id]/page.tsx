import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getChapterById } from '@/services/admin/catalog';
import { ChapterEditForm } from '@/components/admin/chapter-edit-form';

// =====================================================================
// Sprint 3.8 — /admin/chapters/[id] (edit page).
// The chapter's parent course is fixed (changing it would orphan
// the chapter); the edit form exposes only the chapter's own
// fields. Re-parenting is a future operation; the admin can
// delete + re-create the chapter today.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.chapterEdit' });
  return {
    title: `${t('title')} — CoursEnLigne`,
    alternates: { canonical: `/${locale}/admin/chapters` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminChapterEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return <></>;
  setRequestLocale(locale);
  await requireAdmin();

  const row = await getChapterById(id);
  if (!row) notFound();

  const initial = {
    slug: typeof row.slug === 'string' ? row.slug : '',
    title: typeof row.title === 'string' ? row.title : '',
    description:
      typeof row.description === 'string' ? (row.description as string) : null,
    default_duration_min:
      typeof row.default_duration_min === 'number'
        ? (row.default_duration_min as number)
        : null,
    // v2 schema: `chapters.position` is the natural key
    // (UNIQUE (course_id, position)). The previous v1
    // `sort_order` column still exists in the DB but the
    // API + form contract now uses `position` exclusively.
    position: typeof row.position === 'number' ? (row.position as number) : 0,
    is_published: Boolean(row.is_published),
  };

  return (
    <div className="container py-8 sm:py-12">
      <ChapterEditForm chapterId={id} initial={initial} />
    </div>
  );
}

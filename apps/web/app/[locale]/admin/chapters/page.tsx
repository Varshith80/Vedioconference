import type { Metadata } from 'next';
import { BookText } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllChapters, getAllCourses } from '@/services/admin/catalog';
import { AdminListPage } from '@/components/admin/admin-list-page';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.chapters' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin/chapters` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminChaptersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.chapters');
  const tCommon = await getTranslations('Admin.common');
  const [chapters, courses] = await Promise.all([
    getAllChapters(),
    getAllCourses(),
  ]);

  const courseById = new Map(courses.map((c) => [c.id, c.title]));

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<BookText className="h-6 w-6" aria-hidden={true} />}
      items={chapters}
      getKey={(ch) => ch.id}
      columns={[
        { key: 'title',  label: t('columns.title') },
        { key: 'slug',   label: t('columns.slug') },
        { key: 'course', label: t('columns.course') },
        { key: 'sort',   label: t('columns.sortOrder') },
        { key: 'pub',    label: t('columns.published') },
      ]}
      renderItem={(ch) => (
        <>
          <span className="font-medium text-foreground">{ch.title}</span>
          <span className="font-mono text-xs text-muted-foreground">{ch.slug}</span>
          <span className="text-xs text-muted-foreground">
            {courseById.get(ch.course_id) ?? tCommon('na')}
          </span>
          <span className="text-xs text-muted-foreground">{ch.sort_order}</span>
          <span className="text-xs">
            {ch.is_published ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {tCommon('yes')}
              </span>
            ) : (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {tCommon('no')}
              </span>
            )}
          </span>
        </>
      )}
    />
  );
}

import type { Metadata } from 'next';
import { BookText } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllChapters, getAllCourses } from '@/services/admin/catalog';
import { safeAdminFetch } from '@/services/admin/admin-fetch';
import { AdminListPage } from '@/components/admin/admin-list-page';
import { ChapterRowActions } from '@/components/admin/chapter-row-actions';
import { ChapterCreateTrigger } from '@/components/admin/chapter-create-trigger';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.chapters' });
  return {
    title: `${t('title')} — CoursEnLigne`,
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
  // Each read is wrapped independently so a failure of one
  // doesn't short-circuit the other. The envelope is the
  // source of truth for `AdminDataState`; the .data fallback
  // keeps the row map safe even when the read failed.
  const [chaptersResult, coursesResult] = await Promise.all([
    safeAdminFetch(getAllChapters, 'admin.getAllChapters'),
    safeAdminFetch(getAllCourses, 'admin.getAllCourses'),
  ]);
  const chapters =
    chaptersResult.state === 'data' ? chaptersResult.data : [];
  const courses =
    coursesResult.state === 'data' ? coursesResult.data : [];

  const courseById = new Map(courses.map((c) => [c.id, c.title]));

  // Courses for the create-dialog parent picker.
  const courseOptions = courses.map((c) => ({ value: c.slug, label: c.title }));

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<BookText className="h-6 w-6" aria-hidden={true} />}
      result={chaptersResult}
      labels={{
        loading: tCommon('loading'),
        loadErrorTitle: tCommon('loadErrorTitle'),
        retry: tCommon('retry'),
      }}
      items={chapters}
      getKey={(ch) => ch.id}
      interactiveActions
      headerAction={<ChapterCreateTrigger courses={courseOptions} />}
      actions={(ch) => (
        <ChapterRowActions chapterId={ch.id} slug={ch.slug} title={ch.title} />
      )}
      columns={[
        { key: 'title',  label: t('columns.title'),  width: 'min-w-[260px]' },
        { key: 'course', label: t('columns.course'), width: 'min-w-[200px]' },
        { key: 'pub',    label: t('columns.published'), width: 'w-32' },
      ]}
      renderItem={(ch) => (
        <>
          <span className="font-medium text-foreground">{ch.title}</span>
          <span className="text-xs text-muted-foreground">
            {courseById.get(ch.course_id) ?? tCommon('na')}
          </span>
          <span className="text-xs">
            {ch.is_published ? (
              <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {tCommon('yes')}
              </span>
            ) : (
              <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {tCommon('no')}
              </span>
            )}
          </span>
        </>
      )}
    />
  );
}

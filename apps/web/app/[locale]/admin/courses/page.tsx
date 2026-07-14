import type { Metadata } from 'next';
import { BookOpen } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllCourses, getAllGrades, getAllPrograms } from '@/services/admin/catalog';
import { AdminListPage } from '@/components/admin/admin-list-page';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.courses' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin/courses` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminCoursesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.courses');
  const tCommon = await getTranslations('Admin.common');
  const [courses, programs, grades] = await Promise.all([
    getAllCourses(),
    getAllPrograms(),
    getAllGrades(),
  ]);

  const programById = new Map(programs.map((p) => [p.id, p.title]));
  const gradeById = new Map(grades.map((g) => [g.id, g.title]));

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<BookOpen className="h-6 w-6" aria-hidden={true} />}
      items={courses}
      getKey={(c) => c.id}
      columns={[
        { key: 'title', label: t('columns.title') },
        { key: 'slug',  label: t('columns.slug') },
        { key: 'prog',  label: t('columns.program') },
        { key: 'grade', label: t('columns.grade') },
        { key: 'pub',   label: t('columns.published') },
      ]}
      renderItem={(c) => (
        <>
          <span className="font-medium text-foreground">{c.title}</span>
          <span className="font-mono text-xs text-muted-foreground">{c.slug}</span>
          <span className="text-xs text-muted-foreground">
            {c.program_id ? (programById.get(c.program_id) ?? tCommon('na')) : tCommon('na')}
          </span>
          <span className="text-xs text-muted-foreground">
            {c.grade_id ? (gradeById.get(c.grade_id) ?? tCommon('na')) : tCommon('na')}
          </span>
          <span className="text-xs">
            {c.is_published ? (
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

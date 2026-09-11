import type { Metadata } from 'next';
import { BookOpen } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllCourses, getAllGrades, getAllPrograms } from '@/services/admin/catalog';
import { safeAdminFetch } from '@/services/admin/admin-fetch';
import { AdminListPage } from '@/components/admin/admin-list-page';
import { CourseRowActions } from '@/components/admin/course-row-actions';
import { CourseCreateTrigger } from '@/components/admin/course-create-trigger';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.courses' });
  return {
    title: `${t('title')} — CoursEnLigne`,
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
  // Each read is wrapped independently so one failure does not
  // short-circuit the others. The envelope is the source of
  // truth for `AdminDataState`; the .data fallback keeps the
  // row map and the create-dialog option pickers safe even if
  // a read failed.
  const [coursesResult, programsResult, gradesResult] = await Promise.all([
    safeAdminFetch(getAllCourses, 'admin.getAllCourses'),
    safeAdminFetch(getAllPrograms, 'admin.getAllPrograms'),
    safeAdminFetch(getAllGrades, 'admin.getAllGrades'),
  ]);
  const courses =
    coursesResult.state === 'data' ? coursesResult.data : [];
  const programs =
    programsResult.state === 'data' ? programsResult.data : [];
  const grades =
    gradesResult.state === 'data' ? gradesResult.data : [];

  const programById = new Map(programs.map((p) => [p.id, p.title]));

  // Programs for the create-dialog parent picker.
  const programOptions = programs.map((p) => ({ value: p.slug, label: p.title }));
  // Grades for the create-dialog grade picker, each tagged with its
  // parent program so the form can filter by the chosen program.
  const gradeOptions = grades.map((g) => ({
    value: g.slug,
    label: g.title,
    programSlug: programs.find((p) => p.id === g.program_id)?.slug ?? '',
  }));

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<BookOpen className="h-6 w-6" aria-hidden={true} />}
      result={coursesResult}
      labels={{
        loading: tCommon('loading'),
        loadErrorTitle: tCommon('loadErrorTitle'),
        retry: tCommon('retry'),
      }}
      items={courses}
      getKey={(c) => c.id}
      interactiveActions
      headerAction={
        <CourseCreateTrigger programs={programOptions} grades={gradeOptions} />
      }
      actions={(c) => <CourseRowActions courseId={c.id} slug={c.slug} title={c.title} />}
      columns={[
        { key: 'title', label: t('columns.title'), width: 'min-w-[260px]' },
        { key: 'prog',  label: t('columns.program'), width: 'min-w-[200px]' },
        { key: 'pub',   label: t('columns.published'), width: 'w-32' },
      ]}
      renderItem={(c) => (
        <>
          <span className="font-medium text-foreground">{c.title}</span>
          <span className="text-xs text-muted-foreground">
            {c.program_id ? (programById.get(c.program_id) ?? tCommon('na')) : tCommon('na')}
          </span>
          <span className="text-xs">
            {c.is_published ? (
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

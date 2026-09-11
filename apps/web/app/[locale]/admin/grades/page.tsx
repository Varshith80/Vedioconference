import type { Metadata } from 'next';
import { BookText } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllGrades, getAllPrograms } from '@/services/admin/catalog';
import { safeAdminFetch } from '@/services/admin/admin-fetch';
import { AdminListPage } from '@/components/admin/admin-list-page';
import { GradeRowActions } from '@/components/admin/grade-row-actions';
import { GradeCreateTrigger } from '@/components/admin/grade-create-trigger';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.grades' });
  return {
    title: `${t('title')} — CoursEnLigne`,
    alternates: { canonical: `/${locale}/admin/grades` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminGradesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.grades');
  const tCommon = await getTranslations('Admin.common');
  // Each read is wrapped independently so a failure of one
  // doesn't short-circuit the other (Promise.all rejects on
  // the first throw). The envelope is the source of truth for
  // `AdminDataState`; the .data fallback keeps the row map safe.
  const [gradesResult, programsResult] = await Promise.all([
    safeAdminFetch(getAllGrades, 'admin.getAllGrades'),
    safeAdminFetch(getAllPrograms, 'admin.getAllPrograms'),
  ]);
  const grades =
    gradesResult.state === 'data' ? gradesResult.data : [];
  const programs =
    programsResult.state === 'data' ? programsResult.data : [];

  // id -> title (kept from the existing implementation; used to
  // render the program name in the row).
  const programBySlug = new Map(programs.map((p) => [p.id, p.title]));
  // For the create dialog, programs are exposed as slug-value
  // options keyed by their title.
  const programOptions = programs.map((p) => ({ value: p.slug, label: p.title }));

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<BookText className="h-6 w-6" aria-hidden={true} />}
      result={gradesResult}
      labels={{
        loading: tCommon('loading'),
        loadErrorTitle: tCommon('loadErrorTitle'),
        retry: tCommon('retry'),
      }}
      items={grades}
      getKey={(g) => g.id}
      interactiveActions
      headerAction={<GradeCreateTrigger programs={programOptions} />}
      actions={(g) => <GradeRowActions gradeId={g.id} slug={g.slug} title={g.title} />}
      columns={[
        { key: 'title', label: t('columns.title'), width: 'min-w-[260px]' },
        { key: 'prog',  label: t('columns.program'), width: 'min-w-[200px]' },
      ]}
      renderItem={(g) => (
        <>
          <span className="font-medium text-foreground">{g.title}</span>
          <span className="text-xs text-muted-foreground">
            {programBySlug.get(g.program_id) ?? tCommon('na')}
          </span>
        </>
      )}
    />
  );
}

import type { Metadata } from 'next';
import { CalendarRange } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllSessions, getAllChapters, getAllCourses } from '@/services/admin/catalog';
import { getAllTutors } from '@/services/admin/tutors';
import { safeAdminFetch } from '@/services/admin/admin-fetch';
import { AdminListPage } from '@/components/admin/admin-list-page';
import { SessionCreateTrigger } from '@/components/admin/session-create-trigger';
import { SessionRowActions } from '@/components/admin/session-row-actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.sessions' });
  return {
    title: `${t('title')} — CoursEnLigne`,
    alternates: { canonical: `/${locale}/admin/sessions` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminSessionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.sessions');
  const tCommon = await getTranslations('Admin.common');
  // Each read is wrapped independently so one failure does not
  // short-circuit the others. The envelope is the source of
  // truth for `AdminDataState`; the .data fallback keeps the
  // row map and the create-dialog pickers safe even when a
  // read failed.
  const [sessionsResult, chaptersResult, coursesResult, tutorsResult] = await Promise.all([
    safeAdminFetch(getAllSessions, 'admin.getAllSessions'),
    safeAdminFetch(getAllChapters, 'admin.getAllChapters'),
    safeAdminFetch(getAllCourses, 'admin.getAllCourses'),
    safeAdminFetch(getAllTutors, 'admin.getAllTutors'),
  ]);
  const sessions =
    sessionsResult.state === 'data' ? sessionsResult.data : [];
  const chapters =
    chaptersResult.state === 'data' ? chaptersResult.data : [];
  const courses =
    coursesResult.state === 'data' ? coursesResult.data : [];
  const tutors =
    tutorsResult.state === 'data' ? tutorsResult.data : [];

  // Course chain is needed to scope the create-dialog parent
  // picker (chapter by "Course — Chapter"). It is intentionally
  // not rendered in the list rows — readability contract says
  // slug, sort, internal ids, updatedAt, etc. live on the
  // create/edit page, not the list.
  const courseById = new Map(courses.map((c) => [c.id, c.title]));
  const tutorById = new Map(tutors.map((tu) => [tu.id, tu.full_name]));

  // Build the parent-picker options for the create dialog:
  // "Course — Chapter" labels, keyed by chapter uuid.
  const chapterOptions = chapters.map((ch) => ({
    value: ch.id,
    label: `${courseById.get(ch.course_id) ?? '—'} — ${ch.title}`,
    courseId: ch.course_id,
  }));
  // Tutor options for the create dialog (and the "Unassigned"
  // option is rendered by SearchableSelect when value=null).
  // Sprint 3.8 — tutors are standalone; no headline field.
  const tutorOptions = tutors.map((tu) => ({
    value: tu.id,
    label: tu.full_name,
  }));

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<CalendarRange className="h-6 w-6" aria-hidden={true} />}
      result={sessionsResult}
      labels={{
        loading: tCommon('loading'),
        loadErrorTitle: tCommon('loadErrorTitle'),
        retry: tCommon('retry'),
      }}
      items={sessions}
      getKey={(s) => s.id}
      interactiveActions
      headerAction={
        <SessionCreateTrigger
          chapters={chapterOptions}
          tutors={tutorOptions}
        />
      }
      actions={(s) => (
        <SessionRowActions sessionId={s.id} slug={s.slug} title={s.title} />
      )}
      columns={[
        { key: 'title', label: t('columns.title'), width: 'min-w-[280px]' },
        { key: 'tutor', label: t('columns.assignedTutor'), width: 'min-w-[200px]' },
        { key: 'status', label: t('columns.status'), width: 'w-32' },
      ]}
      renderItem={(s) => {
        // Status: three states. "Preview" wins over "Draft" when
        // both flags are set (a free preview is always public).
        const statusKey: 'published' | 'preview' | 'draft' = !s.is_published
          ? 'draft'
          : s.is_preview
            ? 'preview'
            : 'published';
        const statusClass =
          statusKey === 'published'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            : statusKey === 'preview'
              ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
        return (
          <>
            <span className="font-medium text-foreground">{s.title}</span>
            <span className="text-xs text-muted-foreground">
              {s.tutor_id
                ? (tutorById.get(s.tutor_id) ?? tCommon('na'))
                : <span className="italic">{tCommon('na')}</span>}
            </span>
            <span className="text-xs">
              <span className={`inline-block rounded-full px-2 py-0.5 ${statusClass}`}>
                {t(`status.${statusKey}`)}
              </span>
            </span>
          </>
        );
      }}
    />
  );
}

import type { Metadata } from 'next';
import { GraduationCap } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import {
  getAllTutors,
  getTutorCounts,
} from '@/services/admin/tutors';
import { safeAdminFetch } from '@/services/admin/admin-fetch';
import { AdminListPage } from '@/components/admin/admin-list-page';
import { TutorCreateTrigger } from '@/components/admin/tutor-create-trigger';
import { TutorDeleteButton } from '@/components/admin/tutor-delete-button';

// =====================================================================
// Sprint 3.8 — /admin/tutors (list). Read-only directory of every
// tutor (active + inactive). Tutors are admin reference data: there
// is no tutor authentication, tutor portal, or tutor workflow.
// Per-row counts come from `getTutorCounts(tutorId)` which queries
// session_bookings directly.
//
// Tutors are assigned to sessions from /admin/sessions — there is
// no inline edit UI on this page in this sprint.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.tutors' });
  return {
    title: `${t('title')} — CoursEnLigne`,
    alternates: { canonical: `/${locale}/admin/tutors` },
    robots: { index: false, follow: false },
  };
}

const FORMAT_YEAR_MONTH_DAY = (iso: string): string => iso.slice(0, 10);

export default async function AdminTutorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.tutors');
  const tCommon = await getTranslations('Admin.common');

  const tutorsResult = await safeAdminFetch(getAllTutors, 'admin.getAllTutors');
  // For the per-row counts fan-out we still need the raw rows
  // even when the envelope is in `error` or `empty`, so the
  // counts look-up stays empty rather than blowing up. Only
  // pull the rows when the envelope is `data`.
  const tutors =
    tutorsResult.state === 'data' ? tutorsResult.data : [];
  // Per-tutor counts. We fan out the reads in parallel because
  // the admin directory is small (low tens of rows) and the
  // session_bookings counts are sub-millisecond on the v2
  // indexes. If the directory grows we can move this into a
  // single grouped query.
  const countsEntries = await Promise.all(
    tutors.map(async (tu) => [tu.id, await getTutorCounts(tu.id)] as const),
  );
  const countsByTutor = new Map(countsEntries);

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<GraduationCap className="h-6 w-6" aria-hidden={true} />}
      result={tutorsResult}
      labels={{
        loading: tCommon('loading'),
        loadErrorTitle: tCommon('loadErrorTitle'),
        retry: tCommon('retry'),
      }}
      items={tutors}
      getKey={(tu) => tu.id}
      interactiveActions
      headerAction={<TutorCreateTrigger />}
      actions={(tu) => (
        // Detail page link is a plain anchor (the AdminListPage
        // already has the `interactiveActions` opt-in for that).
        // The trash button is a client component so it can hold
        // its own open/submitting/error state without forcing
        // the whole RSC page to re-render. We group the two in
        // a flex row to match the per-row actions pattern used
        // on the other admin pages.
        <div className="flex items-center gap-1">
          <a
            href={`./tutors/${tu.id}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t('detail.title')} →
          </a>
          <TutorDeleteButton tutorId={tu.id} fullName={tu.full_name} />
        </div>
      )}
      columns={[
        { key: 'name',  label: t('columns.name'),  width: 'min-w-[200px]' },
        { key: 'email', label: t('columns.email'), width: 'min-w-[200px]' },
        { key: 'act',   label: t('columns.activeSessions'), width: 'w-28' },
        { key: 'tot',   label: t('columns.totalAssigned'), width: 'w-32' },
        { key: 'status', label: t('columns.status'), width: 'w-28' },
        { key: 'join',  label: t('columns.joinedAt'), width: 'w-32' },
      ]}
      renderItem={(tu) => {
        // Contract: return one Fragment with N children matching
        // the N columns declared above. AdminListPage unwraps the
        // Fragment's children and maps each to its own <td>.
        // Returning a wrapper component here would collapse the
        // N cells into a single <td> (the component element
        // itself counts as one child), which is why this page
        // was the only one still misaligned. Inline the cells.
        const counts = countsByTutor.get(tu.id) ?? { active: 0, total: 0 };
        const isActive = tu.status === 'active';
        return (
          <>
            <span className="flex flex-col text-xs">
              <span className="font-medium text-foreground">{tu.full_name}</span>
              {tu.phone ? (
                <span className="text-muted-foreground">{tu.phone}</span>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {tu.email || '—'}
            </span>
            <span className="text-xs tabular-nums text-foreground">
              {counts.active}
            </span>
            <span className="text-xs tabular-nums text-foreground">
              {counts.total}
            </span>
            <span className="text-xs">
              {isActive ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {t('status.active')}
                </span>
              ) : (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {t('status.inactive')}
                </span>
              )}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {FORMAT_YEAR_MONTH_DAY(tu.created_at)}
            </span>
          </>
        );
      }}
    />
  );
}

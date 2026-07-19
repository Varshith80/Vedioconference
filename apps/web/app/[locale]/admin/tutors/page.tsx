import type { Metadata } from 'next';
import { GraduationCap } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import {
  getAllTutors,
  getTutorCounts,
  type AdminTutor,
} from '@/services/admin/tutors';
import { AdminListPage } from '@/components/admin/admin-list-page';
import { TutorCreateTrigger } from '@/components/admin/tutor-create-trigger';

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
    title: `${t('title')} — Intégrale`,
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

  const tutors = await getAllTutors();
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
      items={tutors}
      getKey={(tu) => tu.id}
      headerAction={<TutorCreateTrigger />}
      actions={(tu) => (
        // Detail page link is a plain anchor (the AdminListPage
        // already has the `interactiveActions` opt-in for that).
        <a
          href={`./tutors/${tu.id}`}
          className="text-xs font-medium text-primary hover:underline"
        >
          {t('detail.title')} →
        </a>
      )}
      columns={[
        { key: 'name',  label: t('columns.name') },
        { key: 'email', label: t('columns.email') },
        { key: 'act',   label: t('columns.activeSessions') },
        { key: 'tot',   label: t('columns.totalAssigned') },
        { key: 'status', label: t('columns.status') },
        { key: 'join',  label: t('columns.joinedAt') },
      ]}
      renderItem={(tu) => (
        <TutorRow
          tutor={tu}
          counts={countsByTutor.get(tu.id) ?? { active: 0, total: 0 }}
          activeLabel={t('status.active')}
          inactiveLabel={t('status.inactive')}
        />
      )}
    />
  );
}

function TutorRow({
  tutor,
  counts,
  activeLabel,
  inactiveLabel,
}: {
  tutor: AdminTutor;
  counts: { active: number; total: number };
  activeLabel: string;
  inactiveLabel: string;
}): React.JSX.Element {
  return (
    <>
      <span className="flex flex-col text-xs">
        <span className="font-medium text-foreground">{tutor.full_name}</span>
        {tutor.phone ? (
          <span className="text-muted-foreground">{tutor.phone}</span>
        ) : null}
      </span>
      <span className="text-xs text-muted-foreground">{tutor.email || '—'}</span>
      <span className="text-xs tabular-nums text-foreground">{counts.active}</span>
      <span className="text-xs tabular-nums text-foreground">{counts.total}</span>
      <span className="text-xs">
        {tutor.status === 'active' ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            {activeLabel}
          </span>
        ) : (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {inactiveLabel}
          </span>
        )}
      </span>
      <span className="font-mono text-xs text-muted-foreground">
        {FORMAT_YEAR_MONTH_DAY(tutor.created_at)}
      </span>
    </>
  );
}

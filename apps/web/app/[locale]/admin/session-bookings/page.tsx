import type { Metadata } from 'next';
import { CalendarCheck } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAdminSessionBookings } from '@/services/admin/session-bookings';
import { AdminListPage } from '@/components/admin/admin-list-page';
import { ManualCompleteButton } from '@/components/admin/manual-complete-button';

// =====================================================================
// Sprint 8 — B-19 /admin/session-bookings (back-office list).
//
// Lists non-terminal session bookings (`scheduled`, `confirmed`,
// and any that have slipped out of `completed`). Per-row
// "Mark complete" action for the manual-complete B-19 flow.
//
// We deliberately create a NEW page (rather than extending
// the dirty /admin/bookings or /admin/sessions detail pages)
// so this slice stays surgical. When the admin catalog
// cleanup sprint lands, the legacy /admin/bookings surface
// can be retired and this page moves into its slot.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.sessionBookings' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin/session-bookings` },
    robots: { index: false, follow: false },
  };
}

const FORMAT_DATE_TIME = (iso: string): string => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const STATUS_BADGE: Record<string, string> = {
  scheduled: 'rounded-full bg-sky-100 px-2 py-0.5 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  confirmed: 'rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  completed: 'rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  cancelled: 'rounded-full bg-rose-100 px-2 py-0.5 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  no_show: 'rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  rescheduled: 'rounded-full bg-violet-100 px-2 py-0.5 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
};

export default async function AdminSessionBookingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.sessionBookings');
  const tStatus = await getTranslations('Dashboard.bookings.status');

  const bookings = await getAdminSessionBookings();

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<CalendarCheck className="h-6 w-6" aria-hidden={true} />}
      items={bookings}
      getKey={(b) => b.id}
      interactiveActions
      actions={(b) => (
        <div className="flex items-center gap-1">
          <ManualCompleteButton bookingId={b.id} status={b.status} />
        </div>
      )}
      columns={[
        { key: 'student', label: t('columns.student'), width: 'min-w-[200px]' },
        { key: 'session', label: t('columns.session'), width: 'min-w-[240px]' },
        { key: 'when', label: t('columns.scheduledStart'), width: 'w-44' },
        { key: 'status', label: t('columns.status'), width: 'w-32' },
      ]}
      renderItem={(b) => {
        const badge = STATUS_BADGE[b.status] ?? STATUS_BADGE['scheduled']!;
        return (
          <>
            <span className="font-mono text-xs text-muted-foreground">
              {b.studentId.slice(0, 8)}
            </span>
            <span className="line-clamp-1 text-xs font-medium text-foreground">
              {b.sessionId.slice(0, 8)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {FORMAT_DATE_TIME(b.scheduledStart)}
            </span>
            <span className="text-xs">
              <span className={badge}>{tStatus(b.status)}</span>
            </span>
          </>
        );
      }}
    />
  );
}
import type { Metadata } from 'next';
import { Package } from 'lucide-react';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale, type Locale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { listPackGrants } from '@/services/admin/pack-grants';
import { safeAdminFetch } from '@/services/admin/admin-fetch';
import { AdminListPage } from '@/components/admin/admin-list-page';
import { formatCents as formatCentsShared } from '@/lib/utils/format';

// =====================================================================
// Phase 1 — Feature B: /admin/packs (back-office list).
//
// Lists every Pack 10 grant, newest first, capped at 200 rows.
// Each row links to the detail page where the operator can
// preview and execute the €35/unused-session refund.
//
// Re-uses the AdminListPage shell (Sprint 3.8+) so the table
// layout is consistent with the rest of the admin console.
// The list cell row is a flat array of cells (the standard
// AdminListPage contract — see
// components/admin/admin-list-page.tsx).
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.packs' });
  return {
    title: `${t('title')} — CoursEnLigne`,
    alternates: { canonical: `/${locale}/admin/packs` },
    robots: { index: false, follow: false },
  };
}

const STATUS_COLOR: Record<string, string> = {
  pending_payment: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  completed: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  cancelled: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  no_show: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  rescheduled: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  refunded: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};

function formatCents(cents: number | null, locale: string): string {
  if (cents == null) return '—';
  return formatCentsShared(cents, 'EUR', (locale || 'en') as Locale);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export default async function AdminPacksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.packs');
  const tCommon = await getTranslations('Admin.common');
  const result = await safeAdminFetch(listPackGrants, 'admin.listPackGrants');
  const rows = result.state === 'data' ? result.data : [];

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<Package className="h-6 w-6" aria-hidden={true} />}
      result={result}
      labels={{
        loading: tCommon('loading'),
        loadErrorTitle: tCommon('loadErrorTitle'),
        retry: tCommon('retry'),
      }}
      items={rows}
      getKey={(p) => p.id}
      columns={[
        { key: 'student',  label: t('columns.student'),  width: 'w-56' },
        { key: 'status',   label: t('columns.status'),   width: 'w-32' },
        { key: 'amount',   label: t('columns.amount'),   width: 'w-32' },
        { key: 'credits',  label: t('columns.credits'),  width: 'w-32' },
        { key: 'refunded', label: t('columns.refunded'), width: 'w-32' },
        { key: 'created',  label: t('columns.createdAt'), width: 'w-32' },
        { key: 'expires',  label: t('columns.expiresAt'), width: 'w-32' },
        { key: 'action',   label: '',                    width: 'w-40' },
      ]}
      renderItem={(p) => (
        <>
          <span className="text-sm text-foreground">
            {p.studentName ?? p.studentEmail ?? (
              <span className="font-mono text-xs text-muted-foreground">
                {p.studentId.slice(0, 8)}…
              </span>
            )}
          </span>
          <span className="text-xs">
            <span
              className={
                'inline-block rounded-full px-2 py-0.5 ' +
                (STATUS_COLOR[p.status] ??
                  'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')
              }
            >
              {p.status}
            </span>
          </span>
          <span className="font-medium tabular-nums text-foreground">
            {formatCents(p.amountCents, locale)}
          </span>
          <span className="font-mono text-xs text-foreground">
            {p.consumedCredits}/{p.totalCredits}
          </span>
          <span className="font-medium tabular-nums text-foreground">
            {p.refundedAmountCents > 0
              ? formatCents(p.refundedAmountCents, locale)
              : '—'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(p.createdAt)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(p.expiresAt)}
          </span>
          <span>
            <Link
              href={`/${locale}/admin/packs/${p.id}`}
              className="text-xs font-medium text-[color:var(--brand-accent)] hover:underline"
            >
              {t('action.view')}
            </Link>
          </span>
        </>
      )}
    />
  );
}

import type { Metadata } from 'next';
import { CreditCard } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale, type Locale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllPayments } from '@/services/admin/catalog';
import { safeAdminFetch } from '@/services/admin/admin-fetch';
import { AdminListPage } from '@/components/admin/admin-list-page';
import { formatCents as formatCentsShared } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.payments' });
  return {
    title: `${t('title')} — CoursEnLigne`,
    alternates: { canonical: `/${locale}/admin/payments` },
    robots: { index: false, follow: false },
  };
}

// Status pill colors for the payments list. The mapping
// matches the `payments.status` enum documented in the
// schema migration that added the column.
const STATUS_COLOR: Record<string, string> = {
  succeeded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  pending:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  failed:    'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  refunded:  'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  partially_refunded: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
};

// Sprint 5 Slice D — pill colors for the grant_type column so
// the operator can distinguish PAYG / Pack / Subscription at a
// glance from the payments ledger. The grant_type is read from
// the linked `session_grants` row (the entitlement shape).
const GRANT_TYPE_COLOR: Record<string, string> = {
  individual:   'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  pack:         'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  subscription: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

// Use the active route locale so French admins see
// `1 234 €` formatting (whole euros, no decimal zeroes —
// see `lib/utils/format.ts`). Falls back to 'en' when the
// locale is missing. Delegates to the shared formatter so
// the whole app uses one canonical currency display.
function formatCents(cents: number | null, locale: string): string {
  if (cents == null) return '';
  return formatCentsShared(cents, 'EUR', (locale || 'en') as Locale);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export default async function AdminPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.payments');
  const tCommon = await getTranslations('Admin.common');
  const paymentsResult = await safeAdminFetch(getAllPayments, 'admin.getAllPayments');
  const payments = paymentsResult.state === 'data' ? paymentsResult.data : [];

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<CreditCard className="h-6 w-6" aria-hidden={true} />}
      // Sprint 9 — P3-1 error-state distinction. Wrap the
      // service call with safeAdminFetch so a Supabase failure
      // renders the destructive card + Retry instead of an
      // empty list. Labels are resolved server-side because the
      // page is an RSC.
      result={paymentsResult}
      labels={{
        loading: tCommon('loading'),
        loadErrorTitle: tCommon('loadErrorTitle'),
        retry: tCommon('retry'),
      }}
      items={payments}
      getKey={(p) => p.id}
      columns={[
        { key: 'amount',    label: t('columns.amount'),    width: 'w-32' },
        { key: 'grantType', label: t('columns.grantType'), width: 'w-32' },
        { key: 'credits',   label: t('columns.credits'),   width: 'w-32' },
        { key: 'status',    label: t('columns.status'),    width: 'w-32' },
        { key: 'provider',  label: t('columns.provider'),  width: 'w-28' },
        { key: 'paidAt',    label: t('columns.paidAt'),    width: 'w-32' },
        { key: 'created',   label: t('columns.createdAt'), width: 'w-32' },
      ]}
      renderItem={(p) => (
        <>
          <span className="font-medium tabular-nums text-foreground">
            {formatCents(p.amount_cents, locale)}
          </span>
          <span className="text-xs">
            <span
              className={
                'inline-block rounded-full px-2 py-0.5 ' +
                (p.grant_type
                  ? (GRANT_TYPE_COLOR[p.grant_type] ??
                    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')
              }
            >
              {p.grant_type ? t(`grantType.${p.grant_type}`) : '—'}
            </span>
          </span>
          <span className="font-mono text-xs text-foreground">
            {p.total_credits != null
              ? `${p.consumed_credits ?? 0}/${p.total_credits}`
              : '—'}
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
          <span className="font-mono text-xs text-muted-foreground">
            {p.provider ?? '—'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(p.paid_at)}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(p.created_at).toISOString().slice(0, 10)}
          </span>
        </>
      )}
    />
  );
}

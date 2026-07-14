import type { Metadata } from 'next';
import { CreditCard } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllSessionGrants } from '@/services/admin/catalog';
import { AdminListPage } from '@/components/admin/admin-list-page';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.payments' });
  return {
    title: `${t('title')} — Intégrale`,
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
};

function formatCents(cents: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  const grants = await getAllSessionGrants();

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<CreditCard className="h-6 w-6" aria-hidden={true} />}
      items={grants}
      getKey={(g) => g.id}
      columns={[
        { key: 'amount',  label: t('columns.amount') },
        { key: 'cur',     label: t('columns.currency') },
        { key: 'status',  label: t('columns.status') },
        { key: 'grant',   label: t('columns.grant') },
        { key: 'created', label: t('columns.createdAt') },
      ]}
      renderItem={(g) => (
        <>
          <span className="font-medium tabular-nums text-foreground">
            {formatCents(g.amount_cents)}
          </span>
          <span className="text-xs uppercase text-muted-foreground">
            {g.currency ?? tCommon('na')}
          </span>
          <span className="text-xs">
            <span
              className={
                'inline-block rounded-full px-2 py-0.5 ' +
                (STATUS_COLOR[g.status] ??
                  'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')
              }
            >
              {g.status}
            </span>
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {g.id.slice(0, 8)}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(g.created_at).toISOString().slice(0, 10)}
          </span>
        </>
      )}
    />
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale, type Locale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import {
  calculatePackRefundPreview,
  getPackGrantById,
} from '@/services/admin/pack-grants';
import { PackRefundCard } from '@/components/admin/pack-refund-card';
import { formatCents as formatCentsShared } from '@/lib/utils/format';

// =====================================================================
// Phase 1 — Feature B: /admin/packs/[id] (back-office detail).
//
// The operator can:
//   1. See the full Pack grant (student, amount, credits,
//      consumed, refund stamps).
//   2. Preview the €35/unused-session refund amount.
//   3. Execute the refund via POST
//      /api/admin/pack-grants/[id]/refund.
//
// The server pre-computes the preview (so the initial render
// is correct without a JS roundtrip) and passes it to the
// client form, which re-fetches on demand to handle the post-
// submit state flip.
//
// The detail page does NOT call `notFound()` on a missing
// row — it returns a 404 component that the framework's
// `not-found.tsx` renders. Same UX as the rest of the admin
// console.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.packs' });
  return {
    title: `${t('detail.title')} — CoursEnLigne`,
    alternates: { canonical: `/${locale}/admin/packs` },
    robots: { index: false, follow: false },
  };
}

function formatCents(cents: number | null, locale: string): string {
  if (cents == null) return '—';
  return formatCentsShared(cents, 'EUR', (locale || 'en') as Locale);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export default async function AdminPackDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return <></>;
  setRequestLocale(locale);
  await requireAdmin();

  const row = await getPackGrantById(id);
  if (!row) notFound();

  const preview = calculatePackRefundPreview({
    totalCredits: row.totalCredits,
    consumedCredits: row.consumedCredits,
    amountCents: row.amountCents,
    status: row.status,
  });

  const t = await getTranslations('Admin.packs.detail');

  return (
    <div className="container max-w-3xl py-8 sm:py-12">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('subline')}
        </p>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 text-sm">
          <div className="text-xs uppercase text-muted-foreground">
            {t('fields.student')}
          </div>
          <div className="mt-1 font-medium text-foreground">
            {row.studentName ?? '—'}
          </div>
          <div className="text-xs text-muted-foreground">
            {row.studentEmail ?? row.studentId}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 text-sm">
          <div className="text-xs uppercase text-muted-foreground">
            {t('fields.status')}
          </div>
          <div className="mt-1 font-mono text-foreground">
            {row.status}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('fields.created')}: {formatDate(row.createdAt)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 text-sm">
          <div className="text-xs uppercase text-muted-foreground">
            {t('fields.amount')}
          </div>
          <div className="mt-1 font-medium tabular-nums text-foreground">
            {formatCents(row.amountCents, locale)}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('fields.expires')}: {formatDate(row.expiresAt)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 text-sm">
          <div className="text-xs uppercase text-muted-foreground">
            {t('fields.credits')}
          </div>
          <div className="mt-1 font-mono text-foreground">
            {row.consumedCredits} / {row.totalCredits}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('fields.refunded')}: {formatCents(row.refundedAmountCents, locale)}
          </div>
        </div>
      </section>

      <PackRefundCard
        grantId={row.id}
        initialPreview={preview}
        status={row.status}
        locale={locale}
        labels={{
          title: t('refund.title'),
          description: t('refund.description'),
          calculate: t('refund.calculate'),
          execute: t('refund.execute'),
          executing: t('refund.executing'),
          success: t('refund.success'),
          successPendingStripe: t('refund.successPendingStripe'),
          failure: t('refund.failure'),
          webhookFailed: t('refund.webhookFailed'),
          webhookUnavailable: t('refund.webhookUnavailable'),
          alreadyRefunded: t('refund.alreadyRefunded'),
          invalidState: t('refund.invalidState'),
          zeroUnused: t('refund.zeroUnused'),
          unusedSessions: t('refund.unusedSessions'),
          calculated: t('refund.calculated'),
          actual: t('refund.actual'),
          capped: t('refund.capped'),
        }}
      />
    </div>
  );
}

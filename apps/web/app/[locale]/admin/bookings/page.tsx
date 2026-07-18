import type { Metadata } from 'next';
import { CalendarCheck } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllPrograms } from '@/services/admin/catalog';
import {
  getAllBookingsWithDetails,
  type BookingStatus,
  type PaymentStatus,
} from '@/services/admin/bookings';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Badge } from '@/components/ui/badge';
import {
  BookingsFilteredList,
  BOOKING_STATUS_COLOR,
  PAYMENT_STATUS_COLOR,
} from '@/components/admin/bookings-filtered-list';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.bookings' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin/bookings` },
    robots: { index: false, follow: false },
  };
}

const BOOKING_STATUSES: ReadonlyArray<BookingStatus> = [
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
];

const PAYMENT_STATUSES: ReadonlyArray<PaymentStatus> = [
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
];

// Locale-agnostic YYYY-MM-DD HH:MM (UTC). Avoids any
// toLocaleString hydration mismatch on SSR/CSR.
function formatDateTime(iso: string): string {
  return iso.slice(0, 10) + ' ' + iso.slice(11, 16);
}

export default async function AdminBookingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.bookings');

  const [bookings, programs] = await Promise.all([
    getAllBookingsWithDetails(),
    getAllPrograms(),
  ]);

  // Derive the tutor dropdown from the bookings we already
  // fetched. Avoids an extra roundtrip; if the same tutor
  // appears on N bookings, dedupe by id.
  const tutorMap = new Map<string, { id: string; full_name: string | null }>();
  for (const b of bookings) {
    if (b.tutor) tutorMap.set(b.tutor.id, { id: b.tutor.id, full_name: b.tutor.full_name });
  }
  const tutors = Array.from(tutorMap.values()).sort((a, b) =>
    (a.full_name ?? '').localeCompare(b.full_name ?? ''),
  );

  // Build the localized label maps for the status pills.
  const bookingStatusLabels: Record<BookingStatus, string> = {
    scheduled: t('status.scheduled'),
    confirmed: t('status.confirmed'),
    completed: t('status.completed'),
    cancelled: t('status.cancelled'),
    no_show: t('status.no_show'),
    rescheduled: t('status.rescheduled'),
  };
  const paymentStatusLabels: Record<PaymentStatus, string> = {
    pending: t('paymentStatus.pending'),
    succeeded: t('paymentStatus.succeeded'),
    failed: t('paymentStatus.failed'),
    refunded: t('paymentStatus.refunded'),
    partially_refunded: t('paymentStatus.partially_refunded'),
  };

  // The 10 column header labels.
  const columns = [
    { key: 'id',      label: t('columns.id') },
    { key: 'student', label: t('columns.student') },
    { key: 'program', label: t('columns.program') },
    { key: 'course',  label: t('columns.course') },
    { key: 'chapter', label: t('columns.chapter') },
    { key: 'session', label: t('columns.session') },
    { key: 'tutor',   label: t('columns.tutor') },
    { key: 'when',    label: t('columns.when') },
    { key: 'status',  label: t('columns.status') },
    { key: 'payment', label: t('columns.payment') },
  ];

  return (
    <Section spacing="default" aria-labelledby="admin-bookings-title">
      <Container>
        <header className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Heading id="admin-bookings-title" level="h1" className="text-3xl sm:text-4xl">
              {t('title')}
            </Heading>
            <Badge variant="outline" className="text-xs">
              {bookings.length}
            </Badge>
          </div>
          <p className="mt-2 text-base text-muted-foreground">{t('subline')}</p>
        </header>

        {bookings.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-2 rounded-md border bg-card p-10 text-center text-sm text-muted-foreground">
            <CalendarCheck className="h-6 w-6" aria-hidden={true} />
            <p>{t('empty')}</p>
          </div>
        ) : (
          <BookingsFilteredList
            bookings={bookings}
            locale={locale}
            basePath="/admin/bookings"
            programs={programs.map((p) => ({ id: p.id, title: p.title }))}
            tutors={tutors}
            labels={{
              search: t('filters.search'),
              searchPlaceholder: t('filters.searchPlaceholder'),
              all: t('filters.all'),
              program: t('filters.program'),
              tutor: t('filters.tutor'),
              bookingStatus: t('filters.bookingStatus'),
              paymentStatus: t('filters.paymentStatus'),
              date: t('filters.date'),
              reset: t('filters.reset'),
              results: t('filters.results'),
              empty: t('filters.emptyFiltered'),
            }}
            bookingStatusEnum={BOOKING_STATUSES}
            paymentStatusEnum={PAYMENT_STATUSES}
            bookingStatusLabels={bookingStatusLabels}
            paymentStatusLabels={paymentStatusLabels}
            columns={columns}
            renderRow={(b) => (
              <BookingRow
                b={b}
                bookingStatusLabels={bookingStatusLabels}
                paymentStatusLabels={paymentStatusLabels}
              />
            )}
          />
        )}
      </Container>
    </Section>
  );
}

// Row renderer. Extracted as a small component for readability;
// lives in the same file because it's a presentation detail of
// the list page and has no other consumer.
function BookingRow({
  b,
  bookingStatusLabels,
  paymentStatusLabels,
}: {
  b: Awaited<ReturnType<typeof getAllBookingsWithDetails>>[number];
  bookingStatusLabels: Record<BookingStatus, string>;
  paymentStatusLabels: Record<PaymentStatus, string>;
}) {
  return (
    <>
      <span className="font-mono text-xs text-muted-foreground">
        {b.id.slice(0, 8)}
      </span>
      <span className="flex flex-col text-xs">
        <span className="font-medium text-foreground">
          {b.student?.full_name ?? '—'}
        </span>
        <span className="text-muted-foreground">{b.student?.email ?? ''}</span>
      </span>
      <span className="text-xs text-foreground">
        {b.curriculum?.program_title ?? '—'}
      </span>
      <span className="text-xs text-foreground">
        {b.curriculum?.course_title ?? '—'}
      </span>
      <span className="text-xs text-foreground">
        {b.curriculum?.chapter_title ?? '—'}
      </span>
      <span className="text-xs text-foreground">
        {b.curriculum?.session_title ?? '—'}
      </span>
      <span className="text-xs text-foreground">
        {b.tutor?.full_name ?? '—'}
      </span>
      <span className="font-mono text-xs tabular-nums text-foreground">
        {formatDateTime(b.scheduled_start)}
      </span>
      <span>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs ${
            BOOKING_STATUS_COLOR[b.status] ??
            'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
          }`}
        >
          {bookingStatusLabels[b.status] ?? b.status}
        </span>
      </span>
      <span>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs ${
            b.payment
              ? PAYMENT_STATUS_COLOR[b.payment.status] ??
                'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
          }`}
        >
          {b.payment ? (paymentStatusLabels[b.payment.status] ?? b.payment.status) : '—'}
        </span>
      </span>
    </>
  );
}

import type { Metadata } from 'next';
import { CalendarCheck } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllPrograms } from '@/services/admin/catalog';
import { getAllTutors } from '@/services/admin/tutors';
import {
  getAllBookingsWithDetails,
  type BookingStatus,
  type PaymentStatus,
} from '@/services/admin/bookings';
import { safeAdminFetch } from '@/services/admin/admin-fetch';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Badge } from '@/components/ui/badge';
import { AdminDataState } from '@/components/admin/admin-data-state';
import { BookingsFilteredList } from '@/components/admin/bookings-filtered-list';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.bookings' });
  return {
    title: `${t('title')} — CoursEnLigne`,
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
  const tCommon = await getTranslations('Admin.common');

  // Each read is wrapped independently so one failure does not
  // short-circuit the others. The bookings envelope is the
  // source of truth for the AdminDataState. The companion reads
  // (programs, tutors) keep their .data fallbacks so the filter
  // dropdown can still render even if a bookings read fails.
  const [bookingsResult, programsResult, tutorsResult] = await Promise.all([
    safeAdminFetch(getAllBookingsWithDetails, 'admin.getAllBookingsWithDetails'),
    safeAdminFetch(getAllPrograms, 'admin.getAllPrograms'),
    safeAdminFetch(getAllTutors, 'admin.getAllTutors'),
  ]);
  const bookings =
    bookingsResult.state === 'data' ? bookingsResult.data : [];
  const programs =
    programsResult.state === 'data' ? programsResult.data : [];
  const allTutors =
    tutorsResult.state === 'data' ? tutorsResult.data : [];

  // Sprint 9 — admin P1-2 fix:
  // The tutor dropdown now lists EVERY tutor in the directory,
  // not just tutors who already appear on a booking. A tutor
  // with zero bookings is still a valid filter value (the admin
  // may want to see "no bookings for tutor X" — i.e. confirm
  // an empty schedule). The dropdown also stays stable as
  // bookings come and go; previously a brand-new tutor was
  // invisible until their first booking landed.
  const tutors = allTutors
    .map((tu) => ({ id: tu.id, full_name: tu.full_name }))
    .sort((a, b) =>
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

  // The 10 column header labels. Each `className` is a Tailwind
  // width utility that pins the cell width on >= sm, so the
  // table grid stays aligned even when one row has a long
  // course title and the next has a short one.
  const columns = [
    { key: 'id',      label: t('columns.id'),      className: 'w-28' },
    { key: 'student', label: t('columns.student'), className: 'min-w-[200px]' },
    { key: 'program', label: t('columns.program'), className: 'min-w-[160px]' },
    { key: 'course',  label: t('columns.course'),  className: 'min-w-[180px]' },
    { key: 'chapter', label: t('columns.chapter'), className: 'min-w-[180px]' },
    { key: 'session', label: t('columns.session'), className: 'min-w-[200px]' },
    { key: 'tutor',   label: t('columns.tutor'),   className: 'w-44' },
    { key: 'when',    label: t('columns.when'),    className: 'w-40' },
    { key: 'status',  label: t('columns.status'),  className: 'w-32' },
    { key: 'payment', label: t('columns.payment'), className: 'w-36' },
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

        <AdminDataState
          result={bookingsResult}
          empty={t('empty')}
          emptyIcon={<CalendarCheck className="h-6 w-6" aria-hidden={true} />}
          labels={{
            loading: tCommon('loading'),
            loadErrorTitle: tCommon('loadErrorTitle'),
            retry: tCommon('retry'),
          }}
        >
          {(rows) => (
            <BookingsFilteredList
              bookings={rows}
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
            />
          )}
        </AdminDataState>
      </Container>
    </Section>
  );
}

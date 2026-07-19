import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarCheck,
  ExternalLink,
  Mail,
  RefreshCw,
  User,
} from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import {
  getBookingByIdWithDetails,
  type BookingStatus,
  type PaymentStatus,
} from '@/services/admin/bookings';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/admin/copy-button';
import {
  BOOKING_STATUS_COLOR,
  PAYMENT_STATUS_COLOR,
} from '@/components/admin/bookings-filtered-list';

// =====================================================================
// Sprint 3.7 + 3.8 — /admin/bookings/[id] (read-only detail view).
//
// Shows everything the operator needs in one place:
//   - Booking info (id, status, scheduled_start/end, timezone,
//     Calendly invitee, created_at, notes)
//   - Student (name, email)
//   - Tutor (name, email) — deep link to /admin/tutors/[id]
//     (Sprint 3.8 polish: was previously the wrong href pointing
//     to /admin/students)
//   - Curriculum chain (Program → Course → Chapter → Session)
//   - Payment (amount, status, provider, created_at)
//   - Meeting (Zoom join_url, meeting_id, passcode, start_url,
//     meeting-status badge at top-right)
//
// Admin actions:
//   - Copy Zoom link / meeting id / passcode / start_url
//   - Open Zoom in a new tab
//   - View student / tutor (deep links to /admin/students and
//     /admin/tutors — both still 404 today, marked as placeholders)
//   - Resend booking email (button present, disabled with a
//     tooltip — wiring lands in a later sprint)
//
// No new schema. No new RLS. The page reads what already exists.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.bookingDetail' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin/bookings` },
    robots: { index: false, follow: false },
  };
}

const BOOKING_STATUSES: ReadonlyArray<BookingStatus> = [
  'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled',
];
const PAYMENT_STATUSES: ReadonlyArray<PaymentStatus> = [
  'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded',
];

function isBookingStatus(s: string): s is BookingStatus {
  return (BOOKING_STATUSES as ReadonlyArray<string>).includes(s);
}
function isPaymentStatus(s: string): s is PaymentStatus {
  return (PAYMENT_STATUSES as ReadonlyArray<string>).includes(s);
}

function formatDateTime(iso: string): string {
  return iso.slice(0, 10) + ' ' + iso.slice(11, 16);
}

function formatCents(cents: number, currency: string): string {
  return (
    (cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    ' ' +
    currency
  );
}

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) return <></>;
  setRequestLocale(locale);

  await requireAdmin();

  const booking = await getBookingByIdWithDetails(id);
  if (!booking) notFound();

  const t = await getTranslations('Admin.bookingDetail');
  const tBookings = await getTranslations('Admin.bookings');

  // Localized status labels (read from the Admin.bookings namespace).
  const bookingStatusLabel = isBookingStatus(booking.status)
    ? tBookings(`status.${booking.status}`)
    : booking.status;
  const paymentStatusLabel =
    booking.payment && isPaymentStatus(booking.payment.status)
      ? tBookings(`paymentStatus.${booking.payment.status}`)
      : booking.payment?.status ?? null;

  return (
    <Section spacing="default" aria-labelledby="admin-booking-detail-title">
      <Container>
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link
            href={`/${locale}/admin/bookings`}
            className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden={true} />
            {t('back')}
          </Link>
        </div>

        <header className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Heading id="admin-booking-detail-title" level="h1" className="text-3xl sm:text-4xl">
                {t('title')}
              </Heading>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {booking.id}
              </p>
            </div>
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                BOOKING_STATUS_COLOR[booking.status] ??
                'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              {bookingStatusLabel}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* BOOKING ---------------------------------------------- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('sections.booking')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label={t('fields.status')}>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                    BOOKING_STATUS_COLOR[booking.status] ??
                    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {bookingStatusLabel}
                </span>
              </Row>
              <Row label={t('fields.scheduledStart')}>
                <span className="font-mono">{formatDateTime(booking.scheduled_start)}</span>
              </Row>
              <Row label={t('fields.scheduledEnd')}>
                <span className="font-mono">{formatDateTime(booking.scheduled_end)}</span>
              </Row>
              <Row label={t('fields.timezone')}>
                {booking.timezone ?? '—'}
              </Row>
              <Row label={t('fields.createdAt')}>
                <span className="font-mono">{formatDateTime(booking.created_at)}</span>
              </Row>
              <Row label={t('fields.calendlyInvitee')}>
                {booking.calendly_invitee_uri ? (
                  <span className="break-all font-mono text-xs">{booking.calendly_invitee_uri}</span>
                ) : (
                  <span className="text-muted-foreground">{t('fields.noCalendly')}</span>
                )}
              </Row>
              {booking.notes ? (
                <Row label={t('fields.notes')}>
                  <span className="whitespace-pre-wrap">{booking.notes}</span>
                </Row>
              ) : null}
            </CardContent>
          </Card>

          {/* STUDENT ---------------------------------------------- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <span className="inline-flex items-center gap-2">
                  <User className="h-4 w-4" aria-hidden={true} />
                  {t('sections.student')}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Name">{booking.student?.full_name ?? '—'}</Row>
              <Row label="Email">
                {booking.student?.email ? (
                  <a
                    href={`mailto:${booking.student.email}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden={true} />
                    {booking.student.email}
                  </a>
                ) : (
                  '—'
                )}
              </Row>
              <div className="pt-1">
                <Link
                  href={`/${locale}/admin/students`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t('actions.viewStudent')} →
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* TUTOR ------------------------------------------------ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('sections.tutor')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Name">{booking.tutor?.full_name ?? '—'}</Row>
              <Row label="Email">
                {booking.tutor?.email ? (
                  <a
                    href={`mailto:${booking.tutor.email}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden={true} />
                    {booking.tutor.email}
                  </a>
                ) : (
                  '—'
                )}
              </Row>
              <div className="pt-1">
                {booking.tutor ? (
                  <Link
                    href={`/${locale}/admin/tutors/${booking.tutor.id}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t('actions.viewTutor')} →
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* CURRICULUM ------------------------------------------ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('sections.curriculum')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Program">{booking.curriculum?.program_title ?? '—'}</Row>
              <Row label="Course">{booking.curriculum?.course_title ?? '—'}</Row>
              <Row label="Chapter">{booking.curriculum?.chapter_title ?? '—'}</Row>
              <Row label="Session">{booking.curriculum?.session_title ?? '—'}</Row>
            </CardContent>
          </Card>

          {/* PAYMENT ---------------------------------------------- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('sections.payment')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {booking.payment ? (
                <>
                  <Row label="Amount">
                    <span className="font-medium tabular-nums">
                      {formatCents(booking.payment.amount_cents, booking.payment.currency)}
                    </span>
                  </Row>
                  <Row label="Status">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                        PAYMENT_STATUS_COLOR[booking.payment.status] ??
                        'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                      }`}
                    >
                      {paymentStatusLabel ?? booking.payment.status}
                    </span>
                  </Row>
                  <Row label="Provider">
                    {booking.payment.provider ?? '—'}
                  </Row>
                  <Row label="Created">
                    <span className="font-mono">{formatDateTime(booking.payment.created_at)}</span>
                  </Row>
                </>
              ) : (
                <p className="text-muted-foreground">{t('noPayment')}</p>
              )}
            </CardContent>
          </Card>

          {/* MEETING ---------------------------------------------- */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  <span className="inline-flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4" aria-hidden={true} />
                    {t('sections.meeting')}
                  </span>
                </CardTitle>
                {booking.meeting ? (
                  <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    {t('meetingStatus.created')}
                  </span>
                ) : (
                  <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {t('meetingStatus.pending')}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {booking.meeting ? (
                <div className="space-y-3 text-sm">
                  <Row label="Zoom link">
                    <span className="break-all font-mono text-xs">{booking.meeting.join_url}</span>
                  </Row>
                  <div className="flex flex-wrap items-center gap-2">
                    <CopyButton value={booking.meeting.join_url} label={t('actions.copyLink')} />
                    <a
                      href={booking.meeting.join_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden={true} />
                      {t('actions.openZoom')}
                    </a>
                  </div>
                  {booking.meeting.start_url ? (
                    <Row label={t('fieldsWithHost.hostStartLabel')}>
                      <span className="break-all font-mono text-xs">
                        {booking.meeting.start_url}
                      </span>
                      <CopyButton
                        value={booking.meeting.start_url}
                        label={t('fieldsWithHost.startUrl')}
                        className="ml-2"
                      />
                    </Row>
                  ) : null}
                  <Row label="Meeting ID">
                    <span className="font-mono">{booking.meeting.meeting_id}</span>
                    <CopyButton
                      value={booking.meeting.meeting_id}
                      label={t('actions.copyMeetingId')}
                      className="ml-2"
                    />
                  </Row>
                  {booking.meeting.passcode ? (
                    <Row label="Passcode">
                      <span className="font-mono">{booking.meeting.passcode}</span>
                      <CopyButton
                        value={booking.meeting.passcode}
                        label={t('actions.copyPasscode')}
                        className="ml-2"
                      />
                    </Row>
                  ) : null}
                  <Row label="Provider">
                    {booking.meeting.provider}
                  </Row>
                </div>
              ) : (
                <p className="text-muted-foreground">{t('noMeeting')}</p>
              )}
            </CardContent>
          </Card>

          {/* ACTIONS ----------------------------------------------- */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                disabled
                title={t('actions.resendEmailDisabled')}
                aria-label={t('actions.resendEmail')}
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium text-muted-foreground opacity-60"
              >
                <RefreshCw className="h-4 w-4" aria-hidden={true} />
                {t('actions.resendEmail')}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('actions.resendEmailDisabled')}
              </p>
            </CardContent>
          </Card>
        </div>
      </Container>
    </Section>
  );
}

// Tiny Row helper used by every Card on this page.
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 sm:gap-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

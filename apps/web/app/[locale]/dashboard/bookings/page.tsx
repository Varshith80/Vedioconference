import type { Metadata } from 'next';
import { CalendarRange } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { EmptyState } from '@/components/shared/empty-state';
import { SessionBookingCard } from '@/components/dashboard/session-booking-card';
import { BRAND } from '@/lib/constants/brand';
import { getCurrentUser } from '@/services/auth';
import { getStudentSessionBookings } from '@/services/curriculum/session-bookings';

// =====================================================================
// /dashboard/bookings — Sprint 3.6 §6.1 migration. The v1 page
// called getStudentModuleBookings() and rendered <BookingCard/>
// (a v1 module-based card). The page now uses the v2
// session-grant/session-booking model. The URL is preserved
// (the sidebar links to /dashboard/bookings) so this is a
// pure read-side migration; the v1 service and the v1 card
// are deleted in the same Sprint 3.6 commit.
// =====================================================================

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Dashboard.bookings' });
  return {
    title: `${t('title')} — ${BRAND.name}`,
    description: t('subline'),
    alternates: { canonical: `/${locale}/dashboard/bookings` },
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

export default async function DashboardBookingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.bookings');
  const tNav = await getTranslations('Nav');

  const user = await getCurrentUser();
  const bookings = user
    ? await getStudentSessionBookings(user.id)
    : [];

  return (
    <Section spacing="default" aria-labelledby="bookings-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: tNav('breadcrumbs.home'), href: '/' },
            { label: tNav('breadcrumbs.dashboard'), href: `/${locale}/dashboard` },
            { label: t('title') },
          ]}
        />
        <div className="mt-3">
          <Heading id="bookings-title" level="h1" className="text-3xl sm:text-4xl">
            {t('title')}
          </Heading>
          <p className="mt-2 text-base text-muted-foreground">
            {t('subline')}
          </p>
        </div>

        {bookings.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={<CalendarRange className="h-6 w-6" aria-hidden={true} />}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
            />
          </div>
        ) : (
          <div className="mt-10">
            <h2 className="sr-only">{t('listHeading')}</h2>
            <ul role="list" className="space-y-4">
              {bookings.map((b) => (
                <li key={b.id}>
                  <SessionBookingCard
                    booking={b}
                    viewHref={`/${locale}/dashboard/sessions/${b.id}`}
                    joinHref={b.meeting?.join_url ?? undefined}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Container>
    </Section>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CalendarClock, ExternalLink, MapPin } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/lib/constants/brand';
import { getCurrentUser } from '@/services/auth';
import { getSessionBookingWithDetails } from '@/services/curriculum/session-bookings';
import { getSessionWithChapter } from '@/services/curriculum/sessions';
import { formatCents } from '@/lib/utils/format';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Dashboard.sessions' });
  return {
    title: `${t('title')} — ${BRAND.name}`,
    alternates: { canonical: `/${locale}/dashboard/sessions/${id}` },
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

export default async function DashboardSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.sessions');
  const tNav = await getTranslations('Nav');
  const tBookings = await getTranslations('Dashboard.bookings');

  const user = await getCurrentUser();
  if (!user) notFound();

  const booking = await getSessionBookingWithDetails(id);
  if (!booking || booking.student_id !== user.id) notFound();

  const session = await getSessionWithChapter(booking.session_id);
  if (!session) notFound();

  const start = new Date(booking.scheduled_start);
  const end = new Date(booking.scheduled_end);
  const startFmt = start.toLocaleString(undefined, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const endFmt = end.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const statusVariant: 'default' | 'secondary' | 'destructive' | 'outline' =
    booking.status === 'confirmed' || booking.status === 'completed'
      ? 'default'
      : booking.status === 'cancelled' || booking.status === 'no_show'
        ? 'destructive'
        : 'secondary';

  const joinUrl = booking.meeting?.join_url ?? null;

  return (
    <Section spacing="default" aria-labelledby="session-detail-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: tNav('breadcrumbs.home'), href: '/' },
            { label: tNav('breadcrumbs.dashboard'), href: `/${locale}/dashboard` },
            { label: t('title'), href: `/${locale}/dashboard/sessions` },
            { label: session.title },
          ]}
        />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Heading id="session-detail-title" level="h1" className="text-3xl sm:text-4xl">
              {session.title}
            </Heading>
            <p className="mt-2 text-sm text-muted-foreground">
              {session.chapter.title}
            </p>
          </div>
          <Badge variant={statusVariant} className="text-[10px]">
            {tBookings(`status.${booking.status}`)}
          </Badge>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  {tBookings('scheduled', { date: startFmt })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  <span className="font-medium text-foreground">
                    {locale === 'fr' ? 'Début' : 'Start'}:
                  </span>{' '}
                  <span className="text-muted-foreground">{startFmt}</span>
                </p>
                <p>
                  <span className="font-medium text-foreground">
                    {locale === 'fr' ? 'Fin' : 'End'}:
                  </span>{' '}
                  <span className="text-muted-foreground">{endFmt}</span>
                </p>
                {session.duration_min ? (
                  <p>
                    <span className="font-medium text-foreground">
                      {locale === 'fr' ? 'Durée' : 'Duration'}:
                    </span>{' '}
                    <span className="text-muted-foreground">
                      {session.duration_min} min
                    </span>
                  </p>
                ) : null}
                {session.description ? (
                  <p className="mt-4 text-muted-foreground">{session.description}</p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <aside className="lg:col-span-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {locale === 'fr' ? 'Rejoindre la séance' : 'Join the session'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {joinUrl ? (
                  <Button asChild className="w-full" size="lg">
                    <a href={joinUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                      {tBookings('joinSession')}
                    </a>
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {booking.status === 'cancelled'
                      ? (locale === 'fr'
                          ? 'Cette séance a été annulée.'
                          : 'This session was cancelled.')
                      : (locale === 'fr'
                          ? 'Le lien Zoom sera disponible quelques minutes avant le début de la séance.'
                          : 'The Zoom link will be available a few minutes before the session starts.')}
                  </p>
                )}
                {session.price_cents != null ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {locale === 'fr' ? 'Payé' : 'Paid'}:{' '}
                    <span className="font-semibold text-foreground">
                      {formatCents(session.price_cents as number, session.currency)}
                    </span>
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </aside>
        </div>
      </Container>
    </Section>
  );
}

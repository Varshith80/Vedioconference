import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { BRAND } from '@/lib/constants/brand';
import { getCurrentUser } from '@/services/auth';
import { getStudentSessionBookings } from '@/services/curriculum/session-bookings';
import { TutorChangeNewForm } from '@/components/dashboard/tutor-change-new-form';

// =====================================================================
// Sprint 6 — /dashboard/tutor-change/new
//
// Server component that loads the student's recent session
// bookings (so the form can offer a meaningful picker) and
// hands them to the client form. The page itself is RSC; the
// form is a client component because it must perform a POST
// and react to the response.
//
// Bookings shown to the student are filtered to ones that are
// eligible for a tutor change: scheduled or confirmed and
// scheduled in the future.
// =====================================================================

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'TutorChange.student',
  });
  return {
    title: `${t('newTitle')} — ${BRAND.name}`,
    description: t('newIntro'),
    alternates: { canonical: `/${locale}/dashboard/tutor-change/new` },
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

function formatDateLabel(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function DashboardTutorChangeNewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('TutorChange');
  const tNav = await getTranslations('Nav');

  const user = await getCurrentUser();
  const bookings = user ? await getStudentSessionBookings(user.id) : [];
  const nowMs = Date.now();

  // Only future, non-cancelled, non-completed bookings are
  // eligible for a tutor change. Booking statuses align with
  // the public.booking_status enum ('scheduled' | 'confirmed'
  // | 'rescheduled' | 'completed' | 'no_show' | 'cancelled').
  const eligible = bookings
    .filter((b) => {
      const status = b.status;
      if (status === 'cancelled' || status === 'completed' || status === 'no_show') {
        return false;
      }
      const startMs = new Date(b.scheduled_start).getTime();
      return !Number.isNaN(startMs) && startMs > nowMs;
    })
    .map((b) => {
      const sessionTitle = b.session?.title ?? 'Session';
      const chapterTitle = b.session?.chapter?.title;
      const when = formatDateLabel(b.scheduled_start, locale);
      const label = chapterTitle
        ? `${when} — ${sessionTitle} (${chapterTitle})`
        : `${when} — ${sessionTitle}`;
      return { id: b.id, label };
    });

  return (
    <Section spacing="default" aria-labelledby="tutor-change-new-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: tNav('breadcrumbs.home'), href: '/' },
            {
              label: tNav('breadcrumbs.dashboard'),
              href: `/${locale}/dashboard`,
            },
            {
              label: t('student.listTitle'),
              href: `/${locale}/dashboard/tutor-change`,
            },
            { label: t('student.newTitle') },
          ]}
        />
        <div className="mt-3">
          <Heading
            id="tutor-change-new-title"
            level="h1"
            className="text-3xl sm:text-4xl"
          >
            {t('student.newTitle')}
          </Heading>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            {t('student.newIntro')}
          </p>
        </div>
        {eligible.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">
            {t('student.empty')}
          </p>
        ) : (
          <TutorChangeNewForm bookings={eligible} locale={locale} />
        )}
      </Container>
    </Section>
  );
}

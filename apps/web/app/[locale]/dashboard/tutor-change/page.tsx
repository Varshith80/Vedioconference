import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BRAND } from '@/lib/constants/brand';
import { getCurrentUser } from '@/services/auth';
import { getMyRequests } from '@/services/student/tutor-change';

// =====================================================================
// Sprint 6 — /dashboard/tutor-change — student list of their
// own tutor-change requests, newest first.
//
// The page renders RSC with a small server-only adapter that
// re-shapes the service output for the UI (labels, badges,
// SLA countdown). It does NOT call into any n8n / Stripe /
// Zoom path. All mutations live behind the API routes under
// /api/student/tutor-change-requests.
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
    title: `${t('listTitle')} — ${BRAND.name}`,
    description: t('listSubtitle'),
    alternates: { canonical: `/${locale}/dashboard/tutor-change` },
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function DashboardTutorChangePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('TutorChange');
  const tNav = await getTranslations('Nav');

  const user = await getCurrentUser();
  const requests = user ? await getMyRequests() : [];

  return (
    <Section spacing="default" aria-labelledby="tutor-change-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: tNav('breadcrumbs.home'), href: '/' },
            {
              label: tNav('breadcrumbs.dashboard'),
              href: `/${locale}/dashboard`,
            },
            { label: t('student.listTitle') },
          ]}
        />
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Heading
              id="tutor-change-title"
              level="h1"
              className="text-3xl sm:text-4xl"
            >
              {t('student.listTitle')}
            </Heading>
            <p className="mt-2 max-w-2xl text-base text-muted-foreground">
              {t('student.listSubtitle')}
            </p>
          </div>
          <Button asChild={true} className="shrink-0">
            <Link href={`/${locale}/dashboard/tutor-change/new`}>
              {t('student.newCta')}
            </Link>
          </Button>
        </div>

        {requests.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title={t('student.empty')}
              description={t('student.listSubtitle')}
            />
          </div>
        ) : (
          <ul role="list" className="mt-10 space-y-4">
            {requests.map((r) => {
              const statusKey = `status.${statusToKey(r.status)}` as const;
              const statusLabel = t(statusKey);
              return (
                <li key={r.id}>
                  <Link
                    href={`/${locale}/dashboard/tutor-change/${r.id}`}
                    className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{statusLabel}</span>
                        {r.overdue ? (
                          <Badge variant="destructive">
                            {t('student.overdueBadge')}
                          </Badge>
                        ) : r.status === 'pending' ? (
                          <Badge variant="secondary">
                            {t('student.slaOkBadge')}
                          </Badge>
                        ) : null}
                      </div>
                      <time
                        className="text-sm text-muted-foreground"
                        dateTime={r.requested_at}
                      >
                        {formatDate(r.requested_at, locale)}
                      </time>
                    </div>
                    <dl className="mt-2 grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                      <div>
                        <dt className="sr-only">
                          {t('student.slaDeadlineLabel')}
                        </dt>
                        <dd>
                          {t('student.slaDeadlineLabel')}:{' '}
                          <span className="text-foreground">
                            {formatDate(r.sla_deadline, locale)}
                          </span>
                        </dd>
                      </div>
                      {r.student_reason ? (
                        <div className="truncate">
                          <dt className="sr-only">
                            {t('student.yourReasonLabel')}
                          </dt>
                          <dd>
                            {t('student.yourReasonLabel')}:{' '}
                            <span className="text-foreground">
                              {r.student_reason}
                            </span>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Container>
    </Section>
  );
}

function statusToKey(s: string): string {
  switch (s) {
    case 'pending':
      return 'pending';
    case 'alternatives_proposed':
      return 'alternativesProposed';
    case 'student_selected':
      return 'studentSelected';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

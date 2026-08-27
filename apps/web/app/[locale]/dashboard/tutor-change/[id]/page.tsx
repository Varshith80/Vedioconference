import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { BRAND } from '@/lib/constants/brand';
import { getCurrentUser } from '@/services/auth';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { getMyRequestById } from '@/services/student/tutor-change';
import { TutorChangeSelectForm } from '@/components/dashboard/tutor-change-select-form';

// =====================================================================
// Sprint 6 — /dashboard/tutor-change/[id]
//
// Server component. Loads the request via the student-scoped
// service, fetches the tutor display names for the current +
// proposed + selected tutor in a single roundtrip, and renders
// the detail card. When status === 'alternatives_proposed' AND
// the current user is the owner, the page mounts the
// `TutorChangeSelectForm` client component so the student can
// pick one.
// =====================================================================

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'TutorChange.student',
  });
  return {
    title: `${t('detailsTitle')} — ${BRAND.name}`,
    alternates: {
      canonical: `/${locale}/dashboard/tutor-change`,
    },
    robots: { index: false, follow: false },
  };
}

export const dynamicParams = true;
export const dynamic = 'force-dynamic';

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
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

export default async function DashboardTutorChangeDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('TutorChange');
  const tNav = await getTranslations('Nav');

  const user = await getCurrentUser();
  if (!user) notFound();

  const request = await getMyRequestById(id);
  if (!request || request.student_id !== user.id) notFound();

  // Gather tutor display names in a single roundtrip.
  const tutorIds = new Set<string>([request.current_tutor_id]);
  for (const id of request.proposed_alternative_tutor_ids) tutorIds.add(id);
  if (request.selected_tutor_id) tutorIds.add(request.selected_tutor_id);

  const supabase = await createSupabaseServerClientUntyped();
  const { data: tutors } = await supabase
    .from('tutors')
    .select('id, full_name')
    .in('id', Array.from(tutorIds));

  const tutorName = new Map<string, string>();
  for (const row of (tutors ?? []) as ReadonlyArray<{
    id: string;
    full_name: string;
  }>) {
    tutorName.set(row.id, row.full_name);
  }

  const alternatives =
    request.status === 'alternatives_proposed'
      ? request.proposed_alternative_tutor_ids.map((tid) => ({
          id: tid,
          label: tutorName.get(tid) ?? tid,
        }))
      : [];

  return (
    <Section spacing="default" aria-labelledby="tutor-change-detail-title">
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
            { label: t('student.detailsTitle') },
          ]}
        />
        <div className="mt-3">
          <Heading
            id="tutor-change-detail-title"
            level="h1"
            className="text-3xl sm:text-4xl"
          >
            {t('student.detailsTitle')}
          </Heading>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t(`status.${statusToKey(request.status)}`)}</Badge>
            {request.overdue ? (
              <Badge variant="destructive">{t('student.overdueBadge')}</Badge>
            ) : null}
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t('student.requestedAtLabel')}</dt>
            <dd>{formatDate(request.requested_at, locale)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('student.slaDeadlineLabel')}</dt>
            <dd>{formatDate(request.sla_deadline, locale)}</dd>
          </div>
          {request.responded_at ? (
            <div>
              <dt className="text-muted-foreground">{t('student.respondedAtLabel')}</dt>
              <dd>{formatDate(request.responded_at, locale)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted-foreground">{t('student.currentTutorLabel')}</dt>
            <dd>{tutorName.get(request.current_tutor_id) ?? request.current_tutor_id}</dd>
          </div>
          {request.selected_tutor_id ? (
            <div>
              <dt className="text-muted-foreground">{t('student.selectedLabel')}</dt>
              <dd>
                {tutorName.get(request.selected_tutor_id) ?? request.selected_tutor_id}
              </dd>
            </div>
          ) : null}
          {request.student_reason ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">{t('student.yourReasonLabel')}</dt>
              <dd className="whitespace-pre-wrap">{request.student_reason}</dd>
            </div>
          ) : null}
          {request.admin_notes ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">{t('student.adminNotesLabel')}</dt>
              <dd className="whitespace-pre-wrap">{request.admin_notes}</dd>
            </div>
          ) : null}
        </dl>

        {alternatives.length > 0 ? (
          <TutorChangeSelectForm
            requestId={request.id}
            alternatives={alternatives}
            locale={locale}
          />
        ) : null}

        <div className="mt-8">
          <Link
            href={`/${locale}/dashboard/tutor-change`}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {t('student.backToList')}
          </Link>
        </div>
      </Container>
    </Section>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Badge } from '@/components/ui/badge';
import { BRAND } from '@/lib/constants/brand';
import { getRequestById } from '@/services/admin/tutor-change';
import { getAllTutors } from '@/services/admin/tutors';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { TutorChangeProposeForm } from '@/components/admin/tutor-change-propose-form';
import { TutorChangeResolveForm } from '@/components/admin/tutor-change-resolve-form';

// =====================================================================
// Sprint 6 — /admin/tutor-change-requests/[id]
//
// Admin-only detail. Renders the request, the underlying
// booking summary, the proposed alternatives, and one of the
// two action surfaces depending on the status:
//
//   - status in (pending, alternatives_proposed):
//       propose-alternatives form (re-mount on every visit so
//       the admin can edit the proposal list)
//       +
//       resolve form (cancel / re-point to a specific tutor)
//
//   - status in (completed, cancelled, student_selected):
//       read-only summary.
//
// All forms post back to the admin API routes — the page does
// NOT mutate DB directly.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'TutorChange.admin',
  });
  return {
    title: `${t('detailsTitle')} — ${BRAND.name}`,
    alternates: {
      canonical: `/${locale}/admin/tutor-change-requests`,
    },
    robots: { index: false, follow: false },
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10) + ' ' + iso.slice(11, 16);
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

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function AdminTutorChangeRequestDetailPage({
  params,
}: PageProps) {
  const { locale, id } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('TutorChange');

  const request = await getRequestById(id);
  if (!request) notFound();

  // Load student + tutor display names.
  const supabase = await createSupabaseServerClientUntyped();
  const [{ data: profile }, allTutors] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('id', request.student_id)
      .maybeSingle(),
    getAllTutors(),
  ]);

  const profileRow = profile as
    | {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }
    | null;

  const studentLabel =
    profileRow &&
    ([profileRow.first_name, profileRow.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() ||
      profileRow.email ||
      request.student_id);

  const tutorName = new Map<string, string>(
    allTutors.map((tr) => [tr.id, tr.full_name]),
  );

  const showActionForms =
    request.status === 'pending' || request.status === 'alternatives_proposed';

  return (
    <Section spacing="default" aria-labelledby="tutor-change-detail-title">
      <Container>
        <div className="text-sm text-muted-foreground">
          <Link
            href={`/${locale}/admin/tutor-change-requests`}
            className="underline-offset-4 hover:underline"
          >
            ← {t('admin.listTitle')}
          </Link>
        </div>
        <div className="mt-3">
          <Heading
            id="tutor-change-detail-title"
            level="h1"
            className="text-3xl sm:text-4xl"
          >
            {t('admin.detailsTitle')}
          </Heading>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {t(`status.${statusToKey(request.status)}`)}
            </Badge>
            {request.overdue ? (
              <Badge variant="destructive">{t('admin.overdueBadge')}</Badge>
            ) : null}
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t('admin.studentLabel')}</dt>
            <dd>{studentLabel ?? request.student_id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('admin.currentTutorLabel')}</dt>
            <dd>{tutorName.get(request.current_tutor_id) ?? request.current_tutor_id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('admin.requestedAtLabel')}</dt>
            <dd>{formatDate(request.requested_at)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('admin.slaDeadlineLabel')}</dt>
            <dd>{formatDate(request.sla_deadline)}</dd>
          </div>
          {request.responded_at ? (
            <div>
              <dt className="text-muted-foreground">{t('admin.respondedAtLabel')}</dt>
              <dd>{formatDate(request.responded_at)}</dd>
            </div>
          ) : null}
          {request.selected_tutor_id ? (
            <div>
              <dt className="text-muted-foreground">{t('student.selectedLabel')}</dt>
              <dd>
                {tutorName.get(request.selected_tutor_id) ?? request.selected_tutor_id}
              </dd>
            </div>
          ) : null}
          {request.proposed_alternative_tutor_ids.length > 0 ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">{t('admin.alternativesLabel')}</dt>
              <dd className="mt-1 flex flex-wrap gap-2">
                {request.proposed_alternative_tutor_ids.map((tid) => (
                  <Badge key={tid} variant="outline">
                    {tutorName.get(tid) ?? tid}
                  </Badge>
                ))}
              </dd>
            </div>
          ) : null}
          {request.student_reason ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">{t('admin.studentReasonLabel')}</dt>
              <dd className="whitespace-pre-wrap">{request.student_reason}</dd>
            </div>
          ) : null}
          {request.admin_notes ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">{t('admin.adminNotesLabel')}</dt>
              <dd className="whitespace-pre-wrap">{request.admin_notes}</dd>
            </div>
          ) : null}
        </dl>

        {showActionForms ? (
          <>
            <TutorChangeProposeForm
              requestId={request.id}
              tutors={allTutors.map((tr) => ({ id: tr.id, full_name: tr.full_name }))}
              currentTutorId={request.current_tutor_id}
              locale={locale}
            />
            <TutorChangeResolveForm
              requestId={request.id}
              tutors={allTutors.map((tr) => ({ id: tr.id, full_name: tr.full_name }))}
              currentTutorId={request.current_tutor_id}
              initialNotes={request.admin_notes}
              locale={locale}
            />
          </>
        ) : null}
      </Container>
    </Section>
  );
}

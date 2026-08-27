import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Badge } from '@/components/ui/badge';
import { BRAND } from '@/lib/constants/brand';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { getAllRequests } from '@/services/admin/tutor-change';
import type { TutorChangeRequestStatus } from '@/services/student/tutor-change';

// =====================================================================
// Sprint 6 — /admin/tutor-change-requests
//
// Admin-only list of every tutor-change request, newest first.
// The page shows status, overdue badge, and SLA deadline; rows
// link to the detail page where the admin can propose
// alternatives or resolve.
//
// The optional `?status=…` query param lets the admin narrow
// the list. When omitted, every status is shown.
// =====================================================================

const STATUSES: ReadonlyArray<TutorChangeRequestStatus> = [
  'pending',
  'alternatives_proposed',
  'student_selected',
  'completed',
  'cancelled',
];

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'TutorChange.admin',
  });
  return {
    title: `${t('listTitle')} — ${BRAND.name}`,
    alternates: { canonical: `/${locale}/admin/tutor-change-requests` },
    robots: { index: false, follow: false },
  };
}

function formatDate(iso: string): string {
  // Locale-agnostic YYYY-MM-DD HH:MM (UTC). Avoids hydration
  // mismatches on SSR vs CSR.
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
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string | string[] }>;
}

export default async function AdminTutorChangeRequestsPage({
  params,
  searchParams,
}: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const sp = await searchParams;
  const statusParam = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const statusFilter: TutorChangeRequestStatus | undefined =
    statusParam && (STATUSES as ReadonlyArray<string>).includes(statusParam)
      ? (statusParam as TutorChangeRequestStatus)
      : undefined;

  const t = await getTranslations('TutorChange');
  const requests = await getAllRequests(statusFilter);

  // Bulk-load student display info. We need first_name +
  // last_name; if the schema doesn't expose them, fall back to
  // an empty string (the row will still render).
  const studentIds = Array.from(new Set(requests.map((r) => r.student_id)));
  const supabase = await createSupabaseServerClientUntyped();
  const { data: profiles } = studentIds.length
    ? await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', studentIds)
    : { data: [] as ReadonlyArray<Record<string, unknown>> };

  const profileName = new Map<string, string>();
  for (const row of (profiles ?? []) as ReadonlyArray<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }>) {
    const composed =
      [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
      row.email ||
      row.id;
    profileName.set(row.id, composed);
  }

  return (
    <Section spacing="default" aria-labelledby="tutor-change-admin-title">
      <Container>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Heading
              id="tutor-change-admin-title"
              level="h1"
              className="text-3xl sm:text-4xl"
            >
              {t('admin.listTitle')}
            </Heading>
            <p className="mt-2 max-w-2xl text-base text-muted-foreground">
              {t('admin.listSubtitle')}
            </p>
          </div>
          <nav
            aria-label="Status filter"
            className="flex flex-wrap gap-2 text-sm"
          >
            <Link
              href={`/${locale}/admin/tutor-change-requests`}
              className={
                'rounded-md border px-3 py-1 ' +
                (!statusFilter
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:bg-accent/40')
              }
            >
              {t('admin.filterAll')}
            </Link>
            {STATUSES.map((s) => (
              <Link
                key={s}
                href={`/${locale}/admin/tutor-change-requests?status=${s}`}
                className={
                  'rounded-md border px-3 py-1 ' +
                  (statusFilter === s
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent/40')
                }
              >
                {t(`admin.filter${s.charAt(0).toUpperCase()}${s
                  .slice(1)
                  .replace(/_([a-z])/gu, (_, c: string) => c.toUpperCase())}`)}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {t('admin.studentLabel')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.statusLabel')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.requestedAtLabel')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.slaDeadlineLabel')}
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  —
                </th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    {t('admin.empty')}
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t align-top transition-colors hover:bg-accent/30"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {profileName.get(r.student_id) ?? r.student_id}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">
                          {t(`status.${statusToKey(r.status)}`)}
                        </Badge>
                        {r.overdue ? (
                          <Badge variant="destructive">
                            {t('admin.overdueBadge')}
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <time dateTime={r.requested_at}>
                        {formatDate(r.requested_at)}
                      </time>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <time dateTime={r.sla_deadline}>
                        {formatDate(r.sla_deadline)}
                      </time>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/${locale}/admin/tutor-change-requests/${r.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Container>
    </Section>
  );
}

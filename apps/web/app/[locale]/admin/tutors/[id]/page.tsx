import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import {
  getTutorById,
  getTutorCounts,
  getSessionsForTutor,
} from '@/services/admin/tutors';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// =====================================================================
// Sprint 3.8 — /admin/tutors/[id] (detail). Read-only header
// (name, email, phone, notes, counts) + table of every session
// currently assigned to this tutor. Tutors are standalone admin
// reference data (no auth, no profile) and the detail page is
// intentionally read-only — there is no edit form in this sprint.
//
// Counts:
//   - `active` = session_bookings WHERE tutor_id = id AND status
//     NOT IN ('cancelled','no_show')
//   - `total`   = session_bookings WHERE tutor_id = id
// The "assigned sessions" table comes from
// `getSessionsForTutor` (services/admin/tutors.ts) which joins
// chapter → course → program + grade for the full curriculum
// chain.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.tutors.detail' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin/tutors` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminTutorDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) return <></>;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.tutors.detail');
  const tList = await getTranslations('Admin.tutors');
  const tutor = await getTutorById(id);
  if (!tutor) notFound();

  const [counts, assigned] = await Promise.all([
    getTutorCounts(id),
    getSessionsForTutor(id),
  ]);

  return (
    <Section spacing="default" aria-labelledby="admin-tutor-detail-title">
      <Container>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/${locale}/admin/tutors`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {t('back')}
          </Link>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <GraduationCap className="h-5 w-5" aria-hidden={true} />
              </div>
              <div className="flex flex-col">
                <Heading
                  id="admin-tutor-detail-title"
                  level="h1"
                  className="text-2xl sm:text-3xl"
                >
                  {tutor.full_name}
                </Heading>
                {tutor.phone ? (
                  <p className="text-sm text-muted-foreground">{tutor.phone}</p>
                ) : null}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {tutor.status === 'active' ? tList('status.active') : tList('status.inactive')}
                </Badge>
                <Badge variant="outline" className="font-mono text-xs">
                  {counts.active} / {counts.total}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {tList('columns.email')}
                </dt>
                <dd className="mt-1 text-foreground">{tutor.email || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {tList('columns.activeSessions')}
                </dt>
                <dd className="mt-1 text-foreground">{counts.active}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {tList('columns.totalAssigned')}
                </dt>
                <dd className="mt-1 text-foreground">{counts.total}</dd>
              </div>
            </dl>
            {tutor.notes ? (
              <div className="mt-4">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {tList('columns.notes')}
                </dt>
                <dd className="mt-1 whitespace-pre-line text-sm text-foreground">
                  {tutor.notes}
                </dd>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('sessionsSubline')}</CardTitle>
          </CardHeader>
          <CardContent>
            {assigned.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noSessions')}</p>
            ) : (
              <ul role="list" className="flex flex-col gap-2">
                {assigned.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-col gap-1 rounded-md border bg-card p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{s.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {[
                          s.program?.title,
                          s.grade?.title,
                          s.course.title,
                          s.chapter.title,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        #{s.position}
                      </Badge>
                      {s.is_published ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        >
                          {tList('status.active')}
                        </Badge>
                      ) : null}
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={`/${locale}/admin/sessions/${s.id}`}
                          aria-label={t('viewSession')}
                        >
                          {t('viewSession')}
                        </a>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </Container>
    </Section>
  );
}

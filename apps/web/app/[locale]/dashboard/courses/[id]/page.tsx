import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { BRAND } from '@/lib/constants/brand';
import { getStudentEnrollments } from '@/services/enrollments';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EnrolledCourseCard } from '@/components/dashboard/enrolled-course-card';
import { isModuleUnlocked } from '@/services/bookings/module-unlock';
import type { Locale } from '@/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: `Course — ${BRAND.name}`,
    description: 'Your enrolled course — modules, progress, and bookings.',
    alternates: { canonical: `/${locale}/dashboard/courses` },
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

export default async function DashboardCoursePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id: courseId } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  // Read the course + modules.
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, slug, title, subtitle, subject, level')
    .eq('id', courseId)
    .single();
  const courseRow = course as unknown as { id: string; slug: string; title: string; subtitle: string | null; subject: string; level: string } | null;
  if (courseError || !courseRow) notFound();

  // Find the student's active enrollment for this course.
  const enrollments = await getStudentEnrollments(user.id);
  const enrollment = enrollments.find(
    (e) => e.course_id === courseId && (e.status === 'active' || e.status === 'completed'),
  );
  if (!enrollment) notFound();

  // Read the modules + the student's progress for this enrollment.
  const { data: modules, error: modulesError } = await supabase
    .from('modules')
    .select('id, position, slug, title, description, duration_min, is_preview, is_published, calendly_event_uri')
    .eq('course_id', courseId)
    .eq('is_published', true)
    .order('position', { ascending: true });
  const moduleList = (modules ?? []) as unknown as Array<{
    id: string;
    position: number;
    slug: string;
    title: string;
    description: string | null;
    duration_min: number;
    is_preview: boolean;
    is_published: boolean;
    calendly_event_uri: string | null;
  }>;
  if (modulesError) throw modulesError;

  const { data: progress, error: progressError } = await supabase
    .from('module_progress')
    .select('module_id, status, started_at, completed_at')
    .eq('enrollment_id', enrollment.id);
  if (progressError) throw progressError;
  const progressByModuleId = new Map(
    ((progress ?? []) as unknown as Array<{ module_id: string; status: string; started_at: string | null; completed_at: string | null }>)
      .map((p) => [p.module_id, p]),
  );

  // Compute unlock status for each module. The DB trigger is
  // the source of truth; the service helper is defensive + UX.
  const unlockByModuleId = new Map<string, { unlocked: boolean; reason?: string }>();
  for (const m of moduleList) {
    const u = await isModuleUnlocked({ enrollmentId: enrollment.id, moduleId: m.id });
    unlockByModuleId.set(m.id, { unlocked: u.unlocked, reason: u.reason });
  }

  const tNav   = await getTranslations('Nav');
  const tDash  = await getTranslations('Dashboard');
  const tCours = await getTranslations('Courses');

  return (
    <Section spacing="default" aria-labelledby="course-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: tNav('breadcrumbs.home'),    href: '/' },
            { label: tNav('breadcrumbs.dashboard'), href: `/${locale}/dashboard` },
            { label: courseRow.title },
          ]}
        />
        <div className="mt-3">
          <Heading id="course-title" level="h1" className="text-3xl sm:text-4xl">
            {courseRow.title}
          </Heading>
          {courseRow.subtitle ? (
            <p className="mt-2 text-base text-muted-foreground sm:text-lg">
              {courseRow.subtitle}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">
            {courseRow.subject} · {courseRow.level}
          </p>
        </div>

        <ul role="list" className="mt-10 space-y-4">
          {moduleList.map((m) => {
            const prog = progressByModuleId.get(m.id);
            const unlock = unlockByModuleId.get(m.id) ?? { unlocked: false, reason: 'not_enrolled' };
            const status = prog?.status ?? 'not_started';
            const Icon = status === 'completed' ? CheckCircle2 : CircleDashed;
            return (
              <li key={m.id}>
                <EnrolledCourseCard
                  module={m}
                  status={status as 'not_started' | 'in_progress' | 'completed'}
                  icon={Icon}
                  locked={!unlock.unlocked}
                  lockReason={unlock.reason}
                  locale={locale as Locale}
                  courseId={courseId}
                />
              </li>
            );
          })}
        </ul>

        {moduleList.length === 0 ? (
          <p className="mt-10 text-center text-muted-foreground">{tCours('emptyTitle')}</p>
        ) : null}

        <p className="mt-10 text-xs text-muted-foreground">
          {tDash('enrollmentId')}: <code>{enrollment.id}</code>
        </p>
        <p className="mt-1 text-xs">
          <Link href={`/${locale}/dashboard/bookings`} className="text-[color:var(--brand-accent)] underline-offset-2 hover:underline">
            {tDash('viewAllBookings')}
          </Link>
        </p>
      </Container>
    </Section>
  );
}

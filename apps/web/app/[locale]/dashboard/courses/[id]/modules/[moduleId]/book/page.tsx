import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { BRAND } from '@/lib/constants/brand';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isModuleUnlocked } from '@/services/bookings/module-unlock';
import { CalendlyInlineEmbed } from '@/components/dashboard/calendly-inline-embed';
import { Lock } from 'lucide-react';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: `Book a module — ${BRAND.name}`,
    description: 'Book a live session for a course module.',
    alternates: { canonical: `/${locale}/dashboard/courses` },
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

export default async function ModuleBookPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; moduleId: string }>;
}) {
  const { locale, id: courseId, moduleId } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/auth/login?next=/${locale}/dashboard/courses/${courseId}/modules/${moduleId}/book`);
  }

  // Read the module.
  const { data: module, error: moduleError } = await supabase
    .from('modules')
    .select('id, course_id, position, slug, title, description, duration_min, is_published, calendly_event_uri')
    .eq('id', moduleId)
    .single();
  const moduleRow = module as unknown as { id: string; course_id: string; position: number; slug: string; title: string; description: string | null; duration_min: number; is_published: boolean; calendly_event_uri: string | null } | null;
  if (moduleError || !moduleRow || moduleRow.course_id !== courseId) notFound();
  if (!moduleRow.is_published) notFound();

  // Find the active enrollment.
  const { data: enrollment, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('id, student_id, course_id, status')
    .eq('student_id', user.id)
    .eq('course_id', courseId)
    .maybeSingle();
  const enrollmentRow = enrollment as unknown as { id: string; student_id: string; course_id: string; status: string } | null;
  if (enrollmentError || !enrollmentRow) notFound();
  if (enrollmentRow.status !== 'active' && enrollmentRow.status !== 'pending_payment') notFound();

  // Defensive unlock check.
  const unlock = await isModuleUnlocked({ enrollmentId: enrollmentRow.id, moduleId: moduleRow.id });
  if (!unlock.unlocked) {
    return (
      <Section spacing="default" aria-labelledby="locked-title">
        <Container>
          <div className="mt-10 rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-900">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5" aria-hidden={true} />
              <h1 id="locked-title" className="font-heading text-lg font-semibold">
                Module locked
              </h1>
            </div>
            <p className="mt-2 text-sm">
              This module unlocks when the preceding module is completed.
            </p>
          </div>
        </Container>
      </Section>
    );
  }

  if (!moduleRow.calendly_event_uri) {
    return (
      <Section spacing="default" aria-labelledby="no-calendly-title">
        <Container>
          <div className="mt-10 rounded-lg border bg-muted p-6">
            <h1 id="no-calendly-title" className="font-heading text-lg font-semibold">
              Calendly link not configured
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The tutor has not yet linked a Calendly event type to this module. Please check back later.
            </p>
          </div>
        </Container>
      </Section>
    );
  }

  const tNav   = await getTranslations('Nav');
  const tDash  = await getTranslations('Dashboard.module');

  return (
    <Section spacing="default" aria-labelledby="book-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: tNav('breadcrumbs.home'),     href: '/' },
            { label: tNav('breadcrumbs.dashboard'), href: `/${locale}/dashboard` },
            { label: tNav('breadcrumbs.courses'),  href: `/${locale}/dashboard` },
            { label: `Module ${moduleRow.position}` },
          ]}
        />
        <div className="mt-3">
          <Heading id="book-title" level="h1" className="text-3xl sm:text-4xl">
            {moduleRow.title}
          </Heading>
          <p className="mt-2 text-base text-muted-foreground sm:text-lg">
            {tDash('bookIntro')}
          </p>
        </div>

        <div className="mt-8">
          <CalendlyInlineEmbed
            eventTypeUri={moduleRow.calendly_event_uri}
            prefill={{
              name:  user.user_metadata?.full_name as string | undefined,
              email: user.email ?? undefined,
            }}
            minHeight={720}
          />
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          {tDash('bookHelp')}
        </p>
      </Container>
    </Section>
  );
}

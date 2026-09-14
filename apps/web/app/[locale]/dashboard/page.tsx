import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarRange, FileText, LineChart } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { ProgressOverview } from '@/components/dashboard/progress-overview';
import { BRAND } from '@/lib/constants/brand';
import { getCurrentUser } from '@/services/auth';
import { getStudentProgress } from '@/services/student/progress';
import { getFreeTrialStatus } from '@/services/curriculum/free-trial';
import { FreeTrialBanner, type FreeTrialState } from '@/components/dashboard/free-trial-banner';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Dashboard.home' });
  return {
    title: `${t('title')} — ${BRAND.name}`,
    description: t('subline'),
    alternates: { canonical: `/${locale}/dashboard` },
    robots: { index: false, follow: false },
  };
}

// Dashboard is now wired to real Supabase data. It must
// re-render per request so progress reflects the latest
// bookings.
export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tHome = await getTranslations('Dashboard.home');
  const tProgress = await getTranslations('Dashboard.home.progress');
  const tCards = await getTranslations('Dashboard.cards');
  const tNav = await getTranslations('Nav');

  const user = await getCurrentUser();
  const progress = user
    ? await getStudentProgress(user.id)
    : { programs: [], totals: { purchased: 0, booked: 0, completed: 0 }, hasAny: false };

  // Phase 1 — Feature A: free-trial eligibility. The banner
  // is rendered above the progress overview so the student
  // sees it first. The server resolves the eligibility read
  // (RLS-respecting) and the session to trial. If no
  // published session is available, the banner is hidden.
  const trialState = await resolveFreeTrialState(user?.id ?? null, locale);

  const quickLinks = [
    {
      href: `/${locale}/dashboard/bookings`,
      title: tCards('bookings.title'),
      description: tCards('bookings.description'),
      icon: CalendarRange,
    },
    {
      href: `/${locale}/dashboard/resources`,
      title: tCards('resources.title'),
      description: tCards('resources.description'),
      icon: BookOpen,
    },
    {
      href: `/${locale}/dashboard/profile`,
      title: tCards('profile.title'),
      description: tCards('profile.description'),
      icon: FileText,
    },
  ];
  return (
    <Section spacing="default" aria-labelledby="dashboard-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: tNav('breadcrumbs.home'), href: '/' },
            { label: tNav('breadcrumbs.dashboard') },
          ]}
        />
        <div className="mt-3">
          <Heading id="dashboard-title" level="h1" className="text-3xl sm:text-4xl">
            {tHome('welcome')}
          </Heading>
          <p className="mt-2 text-base text-muted-foreground sm:text-lg">
            {tHome('subline')}
          </p>
        </div>

        {user && trialState && (
          <section aria-labelledby="free-trial-title" className="mt-8">
            <FreeTrialBanner
              initial={trialState.state}
              sessionId={trialState.sessionId}
              catalogHref={`/${locale}/catalog`}
              locale={locale === 'fr' ? 'fr' : 'en'}
            />
          </section>
        )}

        {user && (
          <section
            aria-labelledby="dashboard-progress-title"
            className="mt-10"
          >
            <div className="mb-4 flex items-center gap-2">
              <LineChart
                className="h-5 w-5 text-[color:var(--brand-accent)]"
                aria-hidden={true}
              />
              <Heading
                id="dashboard-progress-title"
                level="h2"
                className="text-xl sm:text-2xl"
              >
                {tProgress('title')}
              </Heading>
            </div>
            <p className="mb-4 text-sm text-muted-foreground sm:text-base">
              {tProgress('subline')}
            </p>
            <ProgressOverview
              locale={locale}
              summary={progress}
              copy={{
                title: tProgress('title'),
                subline: tProgress('subline'),
                emptyTitle: tProgress('emptyTitle'),
                emptyDescription: tProgress('emptyDescription'),
                sessionsPurchased: (count: number) =>
                  tProgress('sessionsPurchased', { count }),
                sessionsCompleted: (count: number) =>
                  tProgress('sessionsCompleted', { count }),
                sessionsScheduled: (count: number) =>
                  tProgress('sessionsScheduled', { count }),
                percent: (percent: number) =>
                  tProgress('percent', { percent }),
                viewAll: tProgress('viewAll'),
              }}
            />
          </section>
        )}

        <section aria-labelledby="dashboard-quicklinks-title" className="mt-12">
          <Heading
            id="dashboard-quicklinks-title"
            level="h2"
            className="text-xl sm:text-2xl"
          >
            {tCards('heading')}
          </Heading>
          <ul role="list" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quickLinks.map((q) => {
              const Icon = q.icon;
              return (
                <li key={q.href}>
                  <Link
                    href={q.href}
                    className="group flex h-full flex-col gap-3 rounded-lg border bg-card p-6 shadow-sm transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="h-6 w-6 text-[color:var(--brand-accent)]" aria-hidden={true} />
                    <h3 className="font-heading text-lg font-semibold text-foreground">
                      {q.title}
                    </h3>
                    <p className="text-pretty text-sm text-muted-foreground">{q.description}</p>
                    <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-[color:var(--brand-accent)]">
                      {tHome('open')}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden={true} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </Container>
    </Section>
  );
}

// ---------------------------------------------------------------------
// Phase 1 — Feature A: free-trial state resolver.
// Server-side. RLS-respecting. Returns `null` if there is no
// signed-in user. Always returns a state when the user is
// signed in:
//   - `not_eligible` (with status) when the student has used
//     their trial. The CTA in that state goes to the catalog.
//   - `eligible` when a published session with a non-null
//     `price_cents` is available. The first such session
//     (ordered by `position`) is the trial target.
//   - `null` (banner hidden) when the student is eligible but
//     no published session is available — there is nothing to
//     trial yet.
// ---------------------------------------------------------------------
async function resolveFreeTrialState(
  userId: string | null,
  _locale: string,
): Promise<{ state: FreeTrialState; sessionId: string } | null> {
  if (!userId) return null;
  const status = await getFreeTrialStatus(userId);
  if (status.used && status.status) {
    // The banner needs a sessionId only as a prop; the
    // `not_eligible` state never uses it. We pass a synthetic
    // empty string; the client component guards against use.
    return {
      state: { kind: 'not_eligible', status: status.status },
      sessionId: '',
    };
  }
  // Eligible: pick the first published session.
  const { createSupabaseServerClientUntyped } = await import(
    '@/lib/supabase/server'
  );
  const supabase = await createSupabaseServerClientUntyped();
  const { data, error } = await supabase
    .from('sessions')
    .select('id')
    .eq('is_published', true)
    .not('price_cents', 'is', null)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const sessionId = (data as unknown as { id: string }).id;
  return { state: { kind: 'eligible' }, sessionId };
}

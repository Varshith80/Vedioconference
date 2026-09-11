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

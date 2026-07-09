import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarRange, FileText } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { BRAND } from '@/lib/constants/brand';

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

// Sprint B1: the dashboard is a placeholder shell. The B2 sprint
// will replace these cards with real data from Supabase.
export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tHome = await getTranslations('Dashboard.home');
  const tCards = await getTranslations('Dashboard.cards');
  const tNav = await getTranslations('Nav');
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

        <ul role="list" className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((q) => {
            const Icon = q.icon;
            return (
              <li key={q.href}>
                <Link
                  href={q.href}
                  className="group flex h-full flex-col gap-3 rounded-lg border bg-card p-6 shadow-sm transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="h-6 w-6 text-[color:var(--brand-accent)]" aria-hidden={true} />
                  <h2 className="font-heading text-lg font-semibold text-foreground">
                    {q.title}
                  </h2>
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
      </Container>
    </Section>
  );
}

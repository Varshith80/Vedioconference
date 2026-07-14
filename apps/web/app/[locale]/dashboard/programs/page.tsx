import type { Metadata } from 'next';
import { School } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { EmptyState } from '@/components/shared/empty-state';
import { SessionGrantCard } from '@/components/dashboard/session-grant-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BRAND } from '@/lib/constants/brand';
import { getCurrentUser } from '@/services/auth';
import { getStudentSessionGrants } from '@/services/curriculum/session-grants';
import type { SessionGrantWithDetails, Program } from '@/types/domain';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Dashboard.programs' });
  return {
    title: `${t('title')} — ${BRAND.name}`,
    description: t('subline'),
    alternates: { canonical: `/${locale}/dashboard/programs` },
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

interface ProgramGroup {
  program: Program;
  grants: ReadonlyArray<SessionGrantWithDetails>;
}

function groupByProgram(
  grants: ReadonlyArray<SessionGrantWithDetails>,
): ReadonlyArray<ProgramGroup> {
  const map = new Map<string, ProgramGroup>();
  for (const g of grants) {
    const key = g.program.id;
    const existing = map.get(key);
    if (existing) {
      map.set(key, { program: existing.program, grants: [...existing.grants, g] });
    } else {
      map.set(key, { program: g.program, grants: [g] });
    }
  }
  return Array.from(map.values());
}

export default async function DashboardProgramsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.programs');
  const tNav = await getTranslations('Nav');

  const user = await getCurrentUser();
  const grants = user ? await getStudentSessionGrants(user.id) : [];
  const groups = groupByProgram(grants);

  return (
    <Section spacing="default" aria-labelledby="programs-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: tNav('breadcrumbs.home'), href: '/' },
            { label: tNav('breadcrumbs.dashboard'), href: `/${locale}/dashboard` },
            { label: t('title') },
          ]}
        />
        <div className="mt-3">
          <Heading id="programs-title" level="h1" className="text-3xl sm:text-4xl">
            {t('title')}
          </Heading>
          <p className="mt-2 text-base text-muted-foreground">{t('subline')}</p>
        </div>

        {groups.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={<School className="h-6 w-6" aria-hidden={true} />}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
            />
          </div>
        ) : (
          <div className="mt-10 space-y-8">
            {groups.map(({ program, grants: programGrants }) => (
              <Card key={program.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <School className="h-4 w-4" aria-hidden="true" />
                    {program.title}
                    <Badge variant="outline" className="text-[10px]">
                      {programGrants.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul role="list" className="space-y-3">
                    {programGrants.map((g) => (
                      <li key={g.id}>
                        <SessionGrantCard
                          grant={g}
                          viewHref={`/${locale}/dashboard/sessions/${g.session.id}`}
                        />
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4">
                    <Link
                      href={`/${locale}/dashboard/sessions`}
                      className="text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t('viewSessions')} →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Container>
    </Section>
  );
}

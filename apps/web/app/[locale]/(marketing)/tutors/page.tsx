import type { Metadata } from 'next';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TutorCard } from '@/components/marketing/tutor-card';
import { listPublishedTutors } from '@/services/tutors';
import { Users2 } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Tutors' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: `/${locale}/tutors` },
  };
}

export default async function TutorsListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tutors = await listPublishedTutors();
  const t = await getTranslations('Tutors');
  const tNav = await getTranslations('Nav');

  return (
    <>
      <PageHeader
        title={t('h1')}
        description={t('intro')}
        breadcrumbs={[
          { label: tNav('breadcrumbs.home'), href: '/' },
          { label: tNav('breadcrumbs.tutors') },
        ]}
      />

      <Section spacing="default">
        <Container>
          {tutors.length === 0 ? (
            <EmptyState
              icon={<Users2 className="h-6 w-6" aria-hidden="true" />}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
            />
          ) : (
            <ul
              role="list"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
            >
              {tutors.map((tutor) => (
                <li key={tutor.id}>
                  <TutorCard tutor={tutor} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>
    </>
  );
}

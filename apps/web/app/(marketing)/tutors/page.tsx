import type { Metadata } from 'next';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TutorCard } from '@/components/marketing/tutor-card';
import { listPublishedTutors } from '@/services/tutors';
import { Users2 } from 'lucide-react';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tuteurs',
  description:
    'Annuaire des tuteurs vérifiés de Vedioconference : sélectionnez votre professeur particulier en lycée ou classes préparatoires.',
  alternates: { canonical: '/tutors' },
};

export default async function TutorsListPage() {
  const tutors = await listPublishedTutors();

  return (
    <>
      <PageHeader
        title="Nos tuteurs"
        description="Tous nos tuteurs sont vérifiés sur dossier, entretien et démonstration de cours."
        breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'Tuteurs' }]}
      />

      <Section spacing="default">
        <Container>
          {tutors.length === 0 ? (
            <EmptyState
              icon={<Users2 className="h-6 w-6" aria-hidden="true" />}
              title="Les profils arrivent au lancement"
              description="L’équipe finalise la sélection des premiers tuteurs."
            />
          ) : (
            <ul
              role="list"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
            >
              {tutors.map((t) => (
                <li key={t.id}>
                  <TutorCard tutor={t} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>
    </>
  );
}

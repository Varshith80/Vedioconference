import type { Metadata } from 'next';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { EmptyState } from '@/components/shared/empty-state';
import { BookOpen } from 'lucide-react';
import { BRAND } from '@/lib/constants/brand';

export const metadata: Metadata = {
  title: `Ressources — ${BRAND.name}`,
  description: 'Supports de cours, exercices corrigés, notes partagées.',
};

export const dynamic = 'force-dynamic';

export default function DashboardResourcesPage() {
  return (
    <Section spacing="default" aria-labelledby="resources-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: 'Accueil', href: '/' },
            { label: 'Tableau de bord', href: '/dashboard' },
            { label: 'Ressources' },
          ]}
        />
        <div className="mt-3">
          <Heading id="resources-title" level="h1" className="text-3xl sm:text-4xl">
            Ressources
          </Heading>
          <p className="mt-2 text-base text-muted-foreground">
            Les supports partagés par vos profs apparaîtront ici.
          </p>
        </div>

        <div className="mt-10">
          <EmptyState
            icon={<BookOpen className="h-6 w-6" aria-hidden={true} />}
            title="Aucune ressource pour l’instant"
            description="Les PDF, fiches d’exercices et notes de cours partagés pendant vos séances seront listés ici."
          />
        </div>
      </Container>
    </Section>
  );
}

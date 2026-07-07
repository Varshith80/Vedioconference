import type { Metadata } from 'next';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { CourseCard } from '@/components/marketing/course-card';
import { getPublishedCourses } from '@/services/courses';
import { BookOpen } from 'lucide-react';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cours',
  description:
    'Catalogue de cours particuliers en ligne : mathématiques, physique, français, anglais. Lycée et classes préparatoires.',
  alternates: { canonical: '/courses' },
};

export default async function CoursesListPage() {
  const courses = await getPublishedCourses();

  return (
    <>
      <PageHeader
        title="Catalogue de cours"
        description="Choisissez un cours et réservez votre créneau. Tous nos cours sont individuels et en visioconférence."
        breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'Cours' }]}
      />

      <Section spacing="default">
        <Container>
          {courses.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-6 w-6" aria-hidden="true" />}
              title="Le catalogue arrive bientôt"
              description="De nouveaux cours seront ajoutés au lancement. Revenez d'ici quelques jours."
            />
          ) : (
            <ul
              role="list"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
            >
              {courses.map((c) => (
                <li key={c.id} className="relative">
                  <CourseCard course={c} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>
    </>
  );
}

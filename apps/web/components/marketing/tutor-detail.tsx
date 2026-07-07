import * as React from 'react';
import Link from 'next/link';
import { Star, BookOpen, Clock } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCents } from '@/lib/utils/format';
import { JsonLd } from '@/components/marketing/jsonld';
import type { PublicTutor } from '@/services/tutors';
import type { Course } from '@/types/domain';

interface TutorDetailProps {
  tutor: PublicTutor;
  courses: Course[];
}

export function TutorDetail({ tutor, courses }: TutorDetailProps) {
  return (
    <>
      <PageHeader
        title={tutor.full_name}
        description={tutor.headline || 'Tuteur vérifié sur Vedioconference'}
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Tuteurs', href: '/tutors' },
          { label: tutor.full_name },
        ]}
      />

      <Section spacing="default">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-8">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 sm:h-20 sm:w-20">
                  {tutor.avatar_url ? <AvatarImage src={tutor.avatar_url} alt="" /> : null}
                  <AvatarFallback>
                    {tutor.full_name
                      .split(' ')
                      .map((w) => w[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                    <Star className="h-4 w-4 fill-warning text-warning" aria-hidden="true" />
                    {tutor.rating.toFixed(1)} / 5
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tutor.years_experience} an{tutor.years_experience > 1 ? 's' : ''} d’expérience
                  </p>
                </div>
              </div>

              <Heading level="h2" className="mt-8 text-2xl sm:text-3xl">
                Présentation
              </Heading>
              <p className="mt-3 max-w-prose text-base text-muted-foreground">
                {tutor.bio || 'Présentation à venir.'}
              </p>
            </div>

            <aside className="lg:col-span-4">
              <div className="rounded-xl border bg-muted/30 p-6">
                <h2 className="text-base font-semibold text-foreground">Réserver une séance</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Les réservations seront disponibles en Phase 3.
                </p>
                <Button className="mt-4 w-full" disabled aria-disabled>
                  Réserver
                </Button>
              </div>
            </aside>
          </div>
        </Container>
      </Section>

      <Section spacing="default" tone="muted" aria-labelledby="tutor-courses-title">
        <Container>
          <Heading id="tutor-courses-title" level="h2" className="text-2xl sm:text-3xl">
            Cours enseignés
          </Heading>
          {courses.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="Aucun cours publié pour l’instant"
                description="Ce tuteur finalise ses supports. Revenez bientôt."
              />
            </div>
          ) : (
            <ul
              role="list"
              className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {courses.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/courses/${c.slug}`}
                    className="block rounded-xl border bg-card p-5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-foreground">
                          {c.title}
                        </p>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {c.level ?? '—'} · {c.subject ?? '—'}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {formatCents(c.price_cents, c.currency)}
                      </Badge>
                    </div>
                    <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="h-3 w-3" aria-hidden="true" />
                        {c.subject ?? '—'}
                      </span>
                      {c.duration_min ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {c.duration_min} min
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>

      <JsonLd
        id="person-jsonld"
        data={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: tutor.full_name,
          description: tutor.bio,
          jobTitle: tutor.headline,
          image: tutor.avatar_url ?? undefined,
          worksFor: {
            '@type': 'Organization',
            name: 'Vedioconference',
          },
        }}
      />
    </>
  );
}

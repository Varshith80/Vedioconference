import * as React from 'react';
import Link from 'next/link';
import { Mail, Phone, BookOpen, Clock } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCents } from '@/lib/utils/format';
import type { PublicTutor } from '@/services/tutors';
import type { Course } from '@/types/domain';

// =====================================================================
// Sprint 3.8 — Public tutor detail page.
//
// Tutors are now standalone reference records. The persona chrome
// (avatar, headline, bio, rating, years_experience) is gone. The
// page now shows the operational contact surface (name, email,
// phone, status) and the list of assigned courses if any.
//
// There is no "book a session" CTA at the public level — booking
// happens inside the course detail page where the assigned tutor
// is shown alongside the chapter list.
// =====================================================================

interface TutorDetailProps {
  tutor: PublicTutor;
  courses: Course[];
}

export function TutorDetail({ tutor, courses }: TutorDetailProps): React.JSX.Element {
  return (
    <>
      <PageHeader
        title={tutor.full_name}
        description={
          tutor.status === 'active'
            ? 'Tuteur actif sur Vedioconference'
            : 'Tuteur inactif sur Vedioconference'
        }
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
              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Nom
                  </dt>
                  <dd className="mt-1 font-medium text-foreground">{tutor.full_name}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Statut
                  </dt>
                  <dd className="mt-1">
                    <Badge variant={tutor.status === 'active' ? 'secondary' : 'outline'}>
                      {tutor.status}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Email
                  </dt>
                  <dd className="mt-1 inline-flex items-center gap-1.5 text-foreground">
                    <Mail className="h-3 w-3" aria-hidden="true" />
                    <a href={`mailto:${tutor.email}`} className="hover:underline">
                      {tutor.email}
                    </a>
                  </dd>
                </div>
                {tutor.phone ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Téléphone
                    </dt>
                    <dd className="mt-1 inline-flex items-center gap-1.5 text-foreground">
                      <Phone className="h-3 w-3" aria-hidden="true" />
                      <a href={`tel:${tutor.phone}`} className="hover:underline">
                        {tutor.phone}
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>

              {tutor.notes ? (
                <div className="mt-8">
                  <Heading level="h2" className="text-2xl sm:text-3xl">
                    Notes internes
                  </Heading>
                  <p className="mt-3 max-w-prose whitespace-pre-line text-base text-muted-foreground">
                    {tutor.notes}
                  </p>
                </div>
              ) : null}
            </div>

            <aside className="lg:col-span-4">
              <div className="rounded-xl border bg-muted/30 p-6">
                <h2 className="text-base font-semibold text-foreground">
                  Réserver une séance
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choisissez un cours enseigné par ce tuteur pour réserver une séance.
                </p>
                <Button className="mt-4 w-full" asChild>
                  <a href="#tutor-courses-title">Voir les cours</a>
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
    </>
  );
}

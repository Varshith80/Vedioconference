import * as React from 'react';
import Link from 'next/link';
import { BookOpen, Clock, GraduationCap, Sparkles } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCents } from '@/lib/utils/format';
import type { PublicTutor } from '@/services/tutors';
import type { Course } from '@/types/domain';

// =====================================================================
// Public tutor detail page.
//
// Tutors are exposed to the marketing site via the curated
// `public.public_tutors` view (id, full_name, subject, bio,
// years_experience). No contact details — those are gated
// behind the authenticated booking flow. The detail page
// shows the persona chrome and the courses the tutor is
// assigned to. There is no "book a session" CTA here:
// booking happens inside the course detail page where the
// assigned tutor is shown alongside the chapter list.
// =====================================================================

interface TutorDetailProps {
  tutor: PublicTutor;
  courses: Course[];
  /** Active application locale, used to render the per-course
   *  price with the correct symbol placement and decimal separator. */
  locale: 'en' | 'fr';
}

export function TutorDetail({ tutor, courses, locale }: TutorDetailProps): React.JSX.Element {
  return (
    <>
      <PageHeader
        title={tutor.full_name}
        description={tutor.subject}
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
                    Matière
                  </dt>
                  <dd className="mt-1">
                    <Badge variant="secondary">{tutor.subject}</Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Expérience
                  </dt>
                  <dd className="mt-1 inline-flex items-center gap-1.5 text-foreground">
                    <GraduationCap className="h-3 w-3" aria-hidden="true" />
                    {tutor.years_experience} an{tutor.years_experience > 1 ? 's' : ''} d’expérience
                  </dd>
                </div>
              </dl>

              {tutor.bio ? (
                <div className="mt-8">
                  <Heading level="h2" className="text-2xl sm:text-3xl">
                    Présentation
                  </Heading>
                  <p className="mt-3 max-w-prose whitespace-pre-line text-base text-muted-foreground">
                    {tutor.bio}
                  </p>
                </div>
              ) : null}
            </div>

            <aside className="lg:col-span-4">
              <div className="rounded-xl border bg-muted/30 p-6">
                <h2 className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-[color:var(--brand-accent)]" aria-hidden="true" />
                  Réserver une séance
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Choisissez un cours enseigné par ce tuteur pour réserver une séance.
                </p>
                <a
                  href="#tutor-courses-title"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Voir les cours
                </a>
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
                        {formatCents(c.price_cents, c.currency, locale)}
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

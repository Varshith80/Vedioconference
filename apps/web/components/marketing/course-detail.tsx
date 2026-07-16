import * as React from 'react';
import { Clock, BookOpen, GraduationCap, Star } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCents } from '@/lib/utils/format';
import { JsonLd } from '@/components/marketing/jsonld';
import type { Course } from '@/types/domain';
import Link from 'next/link';

interface CourseDetailProps {
  course: Course;
  /** Optional pre-localized course title. If set, used
   *  instead of `course.title` for the page header and
   *  breadcrumbs. The runtime app computes this from
   *  `row.metadata?.titles?.[locale]?.title` via
   *  `lib/i18n/localized-title.ts`; the importer is the
   *  only writer of the metadata field. */
  displayTitle?: string;
  /** Tutors who teach this course. Empty array is fine. */
  tutors: Array<{ id: string; full_name: string; avatar_url: string | null; rating: number }>;
}

export function CourseDetail({ course, displayTitle, tutors }: CourseDetailProps) {
  // The display title is the localized string; fall back to
  // `course.title` when the caller did not pre-resolve it.
  const title = displayTitle ?? course.title;
  return (
    <>
      <PageHeader
        title={title}
        description={course.subtitle ?? 'Cours particulier en visioconférence'}
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Cours', href: '/courses' },
          { label: title },
        ]}
        actions={
          <Button asChild size="lg" disabled aria-disabled>
            <span title="Les réservations seront disponibles en Phase 3">
              Réserver un créneau
            </span>
          </Button>
        }
      />

      <Section spacing="default">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-8">
              <Heading level="h2" className="text-2xl sm:text-3xl">
                Présentation
              </Heading>
              <div className="prose prose-slate mt-4 max-w-none text-foreground">
                <p className="text-base text-muted-foreground">
                  {course.description ?? course.subtitle ?? 'Description à venir.'}
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {course.subject && (
                  <Badge variant="outline" className="gap-1">
                    <BookOpen className="h-3 w-3" aria-hidden="true" />
                    {course.subject}
                  </Badge>
                )}
                {course.level && (
                  <Badge variant="outline" className="gap-1">
                    <GraduationCap className="h-3 w-3" aria-hidden="true" />
                    {course.level}
                  </Badge>
                )}
                {course.duration_min ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {course.duration_min} minutes
                  </span>
                ) : null}
              </div>
            </div>

            <aside className="lg:col-span-4">
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">Tarif</p>
                  <p className="mt-1 font-heading text-3xl font-bold text-foreground">
                    {formatCents(course.price_cents, course.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    par séance · TVA incluse
                  </p>
                  <Button asChild className="mt-6 w-full" size="lg" disabled aria-disabled>
                    <span title="Les réservations seront disponibles en Phase 3">
                      Réserver
                    </span>
                  </Button>
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    Annulation gratuite jusqu’à 1h avant.
                  </p>
                </CardContent>
              </Card>
            </aside>
          </div>
        </Container>
      </Section>

      <Section spacing="default" tone="muted" aria-labelledby="course-tutors-title">
        <Container>
          <Heading id="course-tutors-title" level="h2" className="text-2xl sm:text-3xl">
            Tuteurs qui enseignent ce cours
          </Heading>
          {tutors.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="Aucun tuteur disponible pour ce cours"
                description="Revenez bientôt : de nouveaux profils sont ajoutés chaque semaine."
              />
            </div>
          ) : (
            <ul
              role="list"
              className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {tutors.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tutors/${t.id}`}
                    className="block rounded-xl border bg-card p-5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        {t.avatar_url ? <AvatarImage src={t.avatar_url} alt="" /> : null}
                        <AvatarFallback>
                          {t.full_name
                            .split(' ')
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {t.full_name}
                        </p>
                        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Star className="h-3 w-3 fill-warning text-warning" aria-hidden="true" />
                          {t.rating.toFixed(1)} / 5
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>

      <JsonLd
        id="course-jsonld"
        data={{
          '@context': 'https://schema.org',
          '@type': 'Course',
          name: title,
          description: course.subtitle ?? course.description ?? '',
          provider: {
            '@type': 'Organization',
            name: 'Vedioconference',
            sameAs: '/',
          },
          offers: {
            '@type': 'Offer',
            price: (course.price_cents / 100).toFixed(2),
            priceCurrency: course.currency,
            availability: 'https://schema.org/PreOrder',
          },
        }}
      />
    </>
  );
}

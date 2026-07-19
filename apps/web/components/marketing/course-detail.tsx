import * as React from 'react';
import { Clock, BookOpen, GraduationCap } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/utils/format';
import { JsonLd } from '@/components/marketing/jsonld';
import type { Course } from '@/types/domain';

interface CourseDetailProps {
  course: Course;
  /** Optional pre-localized course title. If set, used
   *  instead of `course.title` for the page header and
   *  breadcrumbs. The runtime app computes this from
   *  `row.metadata?.titles?.[locale]?.title` via
   *  `lib/i18n/localized-title.ts`; the importer is the
   *  only writer of the metadata field. */
  displayTitle?: string;
  // Sprint 3.8 — `tutors` is removed. Tutors are now
  // operational reference records, not marketing personas;
  // the course detail page no longer renders a tutor list.
}

export function CourseDetail({ course, displayTitle }: CourseDetailProps) {
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
            <div className="lg:col-span-12">
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

            <aside className="lg:col-span-12">
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

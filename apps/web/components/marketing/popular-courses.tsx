import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, GraduationCap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Button } from '@/components/ui/button';

export interface PopularCourse {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly level: string;
  readonly track: string;
  readonly duration: string;
  readonly price: string;
  readonly accent: 'primary' | 'accent' | 'muted';
}

interface PopularCoursesProps {
  eyebrow: string;
  title: string;
  intro: string;
  seeAllLabel: string;
  seeAllHref: string;
  courses: ReadonlyArray<PopularCourse>;
}

const ACCENT_BG = {
  primary: 'from-primary/15 via-primary/5 to-background',
  accent: 'from-[color:var(--brand-accent)]/15 via-[color:var(--brand-accent)]/5 to-background',
  muted: 'from-muted via-muted/40 to-background',
} as const;

const ACCENT_RING = {
  primary: 'ring-primary/20',
  accent: 'ring-[color:var(--brand-accent)]/20',
  muted: 'ring-border',
} as const;

/**
 * Popular courses. A 1 / 2 / 3-column grid of fictional course
 * tiles. Each card has a soft gradient top band — a quiet nod
 * to the brand's bleu/vert palette — and clean course metadata.
 *
 * Server-rendered, no client JS.
 */
export function PopularCourses({
  eyebrow,
  title,
  intro,
  seeAllLabel,
  seeAllHref,
  courses,
}: PopularCoursesProps) {
  return (
    <Section
      id="popular-courses"
      spacing="default"
      tone="muted"
      aria-labelledby="popular-courses-title"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center sm:text-left">
          <p className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-accent)]">
            {eyebrow}
          </p>
          <Heading
            id="popular-courses-title"
            level="h2"
            className="mt-3 text-3xl font-bold sm:text-4xl"
          >
            {title}
          </Heading>
          <p className="mt-3 text-pretty text-base text-muted-foreground sm:text-lg">
            {intro}
          </p>
        </div>

        <ul
          role="list"
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6"
        >
          {courses.map((course) => (
            <li key={course.id} className="h-full">
              <Card className="group h-full overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <div
                  className={`h-1.5 w-full bg-gradient-to-r ${ACCENT_BG[course.accent]}`}
                  aria-hidden="true"
                />
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
                      {course.track}
                    </Badge>
                    <span className="font-heading text-lg font-semibold text-foreground">
                      {course.price}
                    </span>
                  </div>
                  <CardTitle className="line-clamp-2 text-lg">{course.title}</CardTitle>
                  <CardDescription className="line-clamp-1">{course.level}</CardDescription>
                </CardHeader>
                <CardContent className="flex h-full flex-col">
                  <p className="line-clamp-3 text-sm text-muted-foreground">{course.summary}</p>
                  <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                      {course.track}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {course.duration}
                    </span>
                  </div>
                </CardContent>
                <Link
                  href={`/courses/${course.slug}`}
                  className={`absolute inset-0 rounded-lg ring-1 ring-inset ${ACCENT_RING[course.accent]} opacity-0 transition-opacity group-hover:opacity-100`}
                  aria-label={`Voir le cours ${course.title}`}
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </Card>
            </li>
          ))}
        </ul>

        <div className="mt-10 text-center sm:text-left">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href={seeAllHref}>
              {seeAllLabel}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Star } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Button } from '@/components/ui/button';

export interface FeaturedTutor {
  readonly name: string;
  readonly headline: string;
  readonly bio: string;
  readonly avatarUrl?: string;
  readonly rating: number;
  readonly sessions: number;
  readonly subjects: ReadonlyArray<string>;
  readonly slug: string;
}

interface FeaturedTutorsProps {
  eyebrow: string;
  title: string;
  intro: string;
  seeAllLabel: string;
  seeAllHref: string;
  tutors: ReadonlyArray<FeaturedTutor>;
}

/**
 * Featured tutors. A 1 / 2 / 3-column grid of tutor cards on a
 * muted background. Pure presentational — the data is passed in
 * from the homepage server component, sourced from the
 * `messages` files (fictional tutors, honestly attributed in copy).
 */
export function FeaturedTutors({
  eyebrow,
  title,
  intro,
  seeAllLabel,
  seeAllHref,
  tutors,
}: FeaturedTutorsProps) {
  return (
    <Section id="featured-tutors" spacing="default" aria-labelledby="featured-tutors-title">
      <Container>
        <div className="mx-auto max-w-2xl text-center sm:text-left">
          <p className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-accent)]">
            {eyebrow}
          </p>
          <Heading
            id="featured-tutors-title"
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
          {tutors.map((tutor) => (
            <li key={tutor.slug} className="h-full">
              <TutorTile tutor={tutor} />
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

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function TutorTile({ tutor }: { tutor: FeaturedTutor }) {
  return (
    <Card className="group h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex h-full flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14 ring-1 ring-border">
            {tutor.avatarUrl ? (
              <AvatarImage src={tutor.avatarUrl} alt="" />
            ) : null}
            <AvatarFallback className="bg-primary/10 font-semibold text-primary">
              {initialsOf(tutor.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-heading text-lg font-semibold text-foreground">
              {tutor.name}
            </h3>
            <p className="line-clamp-1 text-sm text-muted-foreground">{tutor.headline}</p>
            <p className="mt-1 inline-flex items-center gap-2 text-xs font-medium text-foreground">
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden="true" />
                <span>
                  {tutor.rating.toFixed(1)} <span className="text-muted-foreground">/ 5</span>
                </span>
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{tutor.sessions} séances</span>
            </p>
          </div>
        </div>

        <p className="line-clamp-3 text-sm text-muted-foreground">{tutor.bio}</p>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {tutor.subjects.slice(0, 3).map((s) => (
            <Badge key={s} variant="secondary" className="font-normal">
              {s}
            </Badge>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand-accent)]">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Vérifié
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

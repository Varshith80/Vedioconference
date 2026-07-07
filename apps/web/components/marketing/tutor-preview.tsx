import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Star } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface PreviewTutor {
  name: string;
  initials: string;
  subjects: string;
  blurb: string;
  rating: number;
}

const PREVIEW_TUTORS: ReadonlyArray<PreviewTutor> = [
  {
    name: 'Anaïs Marchand',
    initials: 'AM',
    subjects: 'Mathématiques · MPSI',
    blurb: 'Polytechnicienne, 5 ans d’expérience en prépa.',
    rating: 4.9,
  },
  {
    name: 'Théo Lemoine',
    initials: 'TL',
    subjects: 'Physique · Terminale',
    blurb: 'Ancien khôlleur, spécialisation lycée.',
    rating: 4.8,
  },
  {
    name: 'Sarah Benali',
    initials: 'SB',
    subjects: 'Français · Première',
    blurb: 'Doctorante en littérature, méthodologie.',
    rating: 4.9,
  },
  {
    name: 'Yanis Idrissi',
    initials: 'YI',
    subjects: 'Anglais · Prépa ECE',
    blurb: 'Bilingue, accent US, préparation TOEIC.',
    rating: 4.7,
  },
] as const;

/**
 * Tutor preview block. Static for Phase 2 (no DB read); the real
 * implementation will pull from `services/tutors.ts` in Phase 4.
 */
export function TutorPreview() {
  return (
    <Section id="tutors-preview" spacing="default" aria-labelledby="tutors-preview-title">
      <Container>
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <Heading id="tutors-preview-title" level="h2">
              Des tuteurs qui ont <span className="text-primary">enseigné</span> avant d’enseigner en ligne.
            </Heading>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              Chaque tuteur est sélectionné sur dossier, démonstration de cours et entretien.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/tutors">
              Voir tous les tuteurs
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <ul
          role="list"
          className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4"
        >
          {PREVIEW_TUTORS.map((t) => (
            <li
              key={t.name}
              className="flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6"
            >
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{t.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.subjects}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{t.blurb}</p>
              <div className="mt-auto flex items-center gap-1 pt-4 text-xs font-medium text-foreground">
                <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden="true" />
                {t.rating.toFixed(1)} / 5
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}

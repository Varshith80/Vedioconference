import * as React from 'react';
import { Quote } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';

interface Testimonial {
  quote: string;
  author: string;
  role: string;
}

const TESTIMONIALS: ReadonlyArray<Testimonial> = [
  {
    quote:
      'En deux mois de cours, j’ai gagné 4 points de moyenne en maths. Les rappels avant chaque séance m’évitent d’oublier.',
    author: 'Léa B.',
    role: 'Terminale S — Paris',
  },
  {
    quote:
      'L’interface est claire, le tuteur connaît parfaitement le programme de MPSI. Je recommande pour les classes prépa.',
    author: 'Mehdi R.',
    role: 'MPSI — Lyon',
  },
  {
    quote:
      'Paiement et facture automatique, je n’ai rien à gérer. Mes parents reçoivent un récap chaque mois.',
    author: 'Camille V.',
    role: '1ère Générale — Bordeaux',
  },
] as const;

export function Testimonials() {
  return (
    <Section
      id="testimonials"
      spacing="default"
      tone="muted"
      aria-labelledby="testimonials-title"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Heading id="testimonials-title" level="h2">
            Ce qu’en disent les élèves et leurs parents
          </Heading>
        </div>
        <ul
          role="list"
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
        >
          {TESTIMONIALS.map((t, i) => (
            <li
              key={i}
              className="flex h-full flex-col rounded-xl border bg-background p-5 shadow-sm sm:p-6"
            >
              <Quote className="h-5 w-5 text-primary" aria-hidden="true" />
              <blockquote className="mt-3 text-sm text-foreground sm:text-base">
                “{t.quote}”
              </blockquote>
              <footer className="mt-4 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{t.author}</span> — {t.role}
              </footer>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}

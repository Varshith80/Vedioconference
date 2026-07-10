import * as React from 'react';
import { Quote, Star } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';

export interface Testimonial {
  readonly quote: string;
  readonly author: string;
  readonly role: string;
  readonly rating?: number;
}

interface TestimonialsI18nProps {
  eyebrow: string;
  title: string;
  intro?: string;
  items: ReadonlyArray<Testimonial>;
}

/**
 * Testimonials. Three quote cards on a muted background with a
 * 5-star rating row. Server-rendered, no client JS.
 */
export function TestimonialsI18n({ eyebrow, title, intro, items }: TestimonialsI18nProps) {
  return (
    <Section
      id="testimonials"
      spacing="default"
      tone="muted"
      aria-labelledby="testimonials-title"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-accent)]">
            {eyebrow}
          </p>
          <Heading id="testimonials-title" level="h2" className="mt-3 text-3xl font-bold sm:text-4xl">
            {title}
          </Heading>
          {intro && (
            <p className="mt-3 text-pretty text-base text-muted-foreground sm:text-lg">
              {intro}
            </p>
          )}
        </div>

        <ul
          role="list"
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
        >
          {items.map((t) => (
            <li
              key={t.author}
              className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <Quote className="h-5 w-5 text-[color:var(--brand-accent)]" aria-hidden="true" />
                {t.rating !== undefined && (
                  <div
                    className="inline-flex items-center gap-0.5 text-warning"
                    aria-label={`${t.rating} sur 5`}
                  >
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${
                          i < t.rating! ? 'fill-warning text-warning' : 'text-border'
                        }`}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                )}
              </div>
              <blockquote className="mt-4 flex-1 text-sm text-foreground sm:text-base">
                “{t.quote}”
              </blockquote>
              <footer className="mt-5 border-t border-border/60 pt-4 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{t.author}</span>
                <span aria-hidden="true"> · </span>
                <span>{t.role}</span>
              </footer>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}

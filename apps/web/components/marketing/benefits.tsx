import * as React from 'react';
import { Award, BadgeCheck, CalendarCheck, CreditCard, LineChart, Video } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';

export interface Benefit {
  readonly icon: 'award' | 'check' | 'calendar' | 'video' | 'card' | 'chart';
  readonly title: string;
  readonly body: string;
}

interface BenefitsProps {
  eyebrow: string;
  title: string;
  intro: string;
  items: ReadonlyArray<Benefit>;
}

const ICONS = {
  award: Award,
  check: BadgeCheck,
  calendar: CalendarCheck,
  video: Video,
  card: CreditCard,
  chart: LineChart,
} as const;

const ICON_BG = [
  'bg-primary/10 text-primary',
  'bg-[color:var(--brand-accent)]/10 text-[color:var(--brand-accent)]',
  'bg-amber-500/10 text-amber-700',
  'bg-rose-500/10 text-rose-700',
  'bg-sky-500/10 text-sky-700',
  'bg-violet-500/10 text-violet-700',
] as const;

/**
 * Benefits — 6 reason cards in a 1/2/3 grid on a clean background.
 * Lighter than FeaturesGrid (no Section tone="muted" wrapper) and
 * the icon chips use a varied palette to break visual monotony.
 * Server-rendered, no client JS.
 */
export function Benefits({ eyebrow, title, intro, items }: BenefitsProps) {
  return (
    <Section id="benefits" spacing="default" aria-labelledby="benefits-title">
      <Container>
        <div className="mx-auto max-w-2xl text-center sm:text-left">
          <p className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-accent)]">
            {eyebrow}
          </p>
          <Heading
            id="benefits-title"
            level="h2"
            className="mt-3 text-3xl font-bold sm:text-4xl"
          >
            {title}
          </Heading>
          <p className="mt-3 text-pretty text-base text-muted-foreground sm:text-lg">{intro}</p>
        </div>

        <ul
          role="list"
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6"
        >
          {items.map((item, i) => {
            const Icon = ICONS[item.icon];
            return (
              <li key={item.title} className="h-full">
                <Card className="group h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="flex h-full flex-col gap-3 p-5 sm:p-6">
                    <div
                      className={cn(
                        'inline-flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105',
                        ICON_BG[i % ICON_BG.length],
                      )}
                      aria-hidden="true"
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-heading text-lg font-semibold text-foreground">
                      {item.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">{item.body}</p>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </Container>
    </Section>
  );
}

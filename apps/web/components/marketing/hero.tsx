import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarClock, ShieldCheck, Video } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const HIGHLIGHTS = [
  { icon: BookOpen, label: 'Programme aligné' },
  { icon: CalendarClock, label: 'Créneaux flexibles' },
  { icon: Video, label: 'Visio HD' },
  { icon: ShieldCheck, label: 'Paiement sécurisé' },
] as const;

/**
 * Above-the-fold marketing block. Server-rendered. Two responsive
 * columns from `md` upward; the visual collapses cleanly to a
 * single column on mobile.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden bg-mesh-gradient pb-12 pt-16 sm:pb-16 sm:pt-20 md:pb-24 md:pt-28"
    >
      <Container>
        <div className="grid items-center gap-10 md:grid-cols-12 md:gap-12">
          <div className="md:col-span-7">
            <Badge variant="secondary" className="mb-4">
              Lycée · Classes préparatoires
            </Badge>
            <h1
              id="hero-title"
              className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl"
            >
              <span className="text-balance">
                Cours particuliers en visioconférence,{' '}
                <span className="text-primary">simples et efficaces</span>.
              </span>
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
              Réservez un créneau, payez en ligne, rejoignez la classe en un clic.
              Tuteurs vérifiés, séances HD, rappels automatiques par e-mail.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg">
                <Link href="/courses">
                  Découvrir les cours
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/auth/register">Créer un compte gratuit</Link>
              </Button>
            </div>

            <ul className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground sm:gap-x-6">
              {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                <li key={label} className="inline-flex items-center gap-1.5">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-5">
            <HeroVisual />
          </div>
        </div>
      </Container>
    </section>
  );
}

/**
 * Decorative visual for the hero. Server-rendered SVG, no client
 * JS, no external assets — keeps LCP fast and avoids CSP risk.
 */
function HeroVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto w-full max-w-md rounded-2xl border bg-card p-4 shadow-lg sm:p-6"
    >
      <div className="flex items-center gap-2 border-b pb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning" />
        <span className="h-2.5 w-2.5 rounded-full bg-success" />
        <span className="ml-3 text-xs font-medium text-muted-foreground">Séance · Mathématiques</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map((d, i) => (
          <div
            key={d}
            className={
              'flex flex-col items-center justify-center rounded-md border p-2 ' +
              (i === 2
                ? 'border-primary bg-primary/5 text-primary'
                : 'text-muted-foreground')
            }
          >
            <span className="font-semibold">{d}</span>
            <span className="mt-0.5 text-[10px]">{10 + i * 2}h</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-md border bg-muted/40 p-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-gradient text-primary-foreground text-xs font-bold">
          AM
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">Anaïs Marchand</p>
          <p className="truncate text-xs text-muted-foreground">MPSI · 5 ans d’expérience</p>
        </div>
        <Button size="sm" variant="outline" tabIndex={-1}>
          Réserver
        </Button>
      </div>
    </div>
  );
}

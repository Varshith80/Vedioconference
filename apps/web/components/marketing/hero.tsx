import * as React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Button } from '@/components/ui/button';
import { HeroCurve } from './hero-curve';
import { LivePill } from './live-pill';

/**
 * Above-the-fold marketing block. Server-rendered. Two responsive
 * columns from `md` upward; the visual collapses cleanly to a
 * single column on mobile.
 *
 * Copy is verbatim from the client homepage brief
 * (`page-accueil-Integrale-2.docx`):
 *   headline:    "Comprendre, pas seulement retenir."
 *   primary CTA: "Réserver un cours gratuit" → /contact
 *   secondary:   "Voir les niveaux" → /levels
 *   social:      "Cours en direct · petits groupes ou individuel · Seconde → Licence"
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden bg-paper-grid pb-14 pt-16 sm:pb-20 sm:pt-20 md:pb-28 md:pt-24"
    >
      <Container>
        <div className="grid items-center gap-10 md:grid-cols-12 md:gap-12">
          <div className="md:col-span-7">
            <LivePill className="mb-5" />
            <h1
              id="hero-title"
              className="font-heading text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl"
            >
              <span className="text-balance">Comprendre, pas seulement retenir.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
              Cours particuliers en ligne, en visio, avec un prof vérifié —
              maths, physique et chimie du lycée à la licence.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg">
                <Link href="/contact">
                  Réserver un cours gratuit
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/levels">Voir les niveaux</Link>
              </Button>
            </div>

            <p className="mt-8 text-sm text-muted-foreground sm:text-base">
              Cours en direct · petits groupes ou individuel · Seconde → Licence
            </p>
          </div>

          <div className="md:col-span-5">
            <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
              <HeroCurve />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

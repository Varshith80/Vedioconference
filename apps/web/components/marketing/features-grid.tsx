import * as React from 'react';
import { CalendarCheck, CreditCard, GraduationCap, Sparkles, Users2, Video } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { cn } from '@/lib/utils/cn';

const FEATURES = [
  {
    icon: GraduationCap,
    title: 'Tuteurs vérifiés',
    body:
      'Profils triés sur dossier, entretien pédagogique et démonstration de cours. Seuls les tuteurs validés enseignent sur la plateforme.',
  },
  {
    icon: CalendarCheck,
    title: 'Réservation en 60 secondes',
    body:
      'Choisissez un cours, un créneau, payez — l’invitation calendrier et le lien de visioconférence arrivent par e-mail.',
  },
  {
    icon: Video,
    title: 'Visio HD sans friction',
    body:
      'Une salle Zoom privée par séance. Aucune installation, partage d’écran et tableau blanc intégrés.',
  },
  {
    icon: CreditCard,
    title: 'Paiement sécurisé',
    body:
      'Stripe Checkout (Apple Pay, Google Pay, CB). Facture et reçu envoyés automatiquement à chaque paiement.',
  },
  {
    icon: Users2,
    title: 'Suivi de progression',
    body:
      'Objectifs, notes de cours, ressources partagées — tout est centralisé dans votre espace élève.',
  },
  {
    icon: Sparkles,
    title: 'Rappels intelligents',
    body:
      'J-24 et H-1, par e-mail. Vous ne manquez plus une séance, même en période d’examens.',
  },
] as const;

/**
 * Marketing features grid. 1 column on mobile, 2 on tablet, 3 on
 * laptop+. Server-rendered, no client JS.
 */
export function FeaturesGrid() {
  return (
    <Section id="features" spacing="default" aria-labelledby="features-title">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <BadgeLabel>Pourquoi nous choisir</BadgeLabel>
          <Heading id="features-title" level="h2" className="mt-3">
            Une plateforme pensée pour les élèves exigeants
          </Heading>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Tout ce dont vous avez besoin pour réussir, du premier clic au rappel avant l’examen.
          </p>
        </div>

        <ul
          role="list"
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6"
        >
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className="group relative flex h-full flex-col rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6"
            >
              <div
                className={cn(
                  'mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg',
                  'bg-primary/10 text-primary',
                )}
                aria-hidden="true"
              >
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground sm:text-lg">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}

function BadgeLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
      {children}
    </span>
  );
}

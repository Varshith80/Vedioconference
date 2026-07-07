import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'À propos',
  description:
    'Vedioconference est née en 2026 à Paris : des cours particuliers de qualité, simples à réserver, transparents sur le prix.',
  alternates: { canonical: '/about' },
};

const VALUES = [
  {
    title: 'Pédagogie d’abord',
    body:
      'Nous recrutons nos tuteurs sur dossier, démonstration et entretien — pas sur une note moyenne.',
  },
  {
    title: 'Transparence tarifaire',
    body:
      'Un prix clair par cours, facturation automatique, reçu envoyé. Pas de commission cachée, pas d’abonnement forcé.',
  },
  {
    title: 'Outils qui servent l’apprentissage',
    body:
      'Le tableau blanc, le partage d’écran, l’enregistrement et les notes sont disponibles par défaut, sans frais supplémentaires.',
  },
] as const;

const STEPS = [
  { n: '01', title: 'Choisissez un cours', body: 'Maths, physique, français, anglais — lycée ou classes prépa.' },
  { n: '02', title: 'Réservez un créneau', body: 'Disponibilités en temps réel, paiement Stripe en moins d’une minute.' },
  { n: '03', title: 'Recevez le lien', body: 'L’invitation calendrier et le lien de visioconférence arrivent par e-mail.' },
  { n: '04', title: 'Rejoignez la séance', body: 'Un clic. Visio HD, partage d’écran, tableau blanc. C’est tout.' },
] as const;

export default function AboutPage() {
  return (
    <>
      <Section spacing="default" aria-labelledby="about-title">
        <Container size="prose">
          <Badge>À propos</Badge>
          <Heading id="about-title" level="h1" className="mt-4">
            Des cours particuliers clairs, efficaces, sans surprise.
          </Heading>
          <p className="mt-5 text-base text-muted-foreground sm:text-lg">
            Vedioconference est née en 2026 à Paris d’un constat simple : réserver un cours particulier
            de qualité reste trop souvent un parcours du combattant — créneaux opaques, prix flous,
            outils en pagaille. Nous avons voulu une plateforme qui fasse le contraire.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/courses">
                Voir les cours
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/contact">Nous contacter</Link>
            </Button>
          </div>
        </Container>
      </Section>

      <Section id="how-it-works" spacing="default" tone="muted" aria-labelledby="how-title">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <Heading id="how-title" level="h2">Comment ça marche</Heading>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              Quatre étapes, du choix du cours à la séance.
            </p>
          </div>

          <ol
            role="list"
            className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4"
          >
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="rounded-xl border bg-card p-5 shadow-sm sm:p-6"
              >
                <span className="text-sm font-bold text-primary">{s.n}</span>
                <h3 className="mt-2 text-base font-semibold text-foreground sm:text-lg">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <Section spacing="default" aria-labelledby="values-title">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <Heading id="values-title" level="h2">Nos valeurs</Heading>
          </div>
          <ul
            role="list"
            className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5"
          >
            {VALUES.map((v) => (
              <li key={v.title} className="rounded-xl border bg-card p-5 sm:p-6">
                <h3 className="text-base font-semibold text-foreground">{v.title}</h3>
                <Separator className="my-3" />
                <p className="text-sm text-muted-foreground">{v.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
      {children}
    </span>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Button } from '@/components/ui/button';
import { CtaBand } from '@/components/marketing/cta-band';
import { SectionEyebrow } from '@/components/marketing/section-eyebrow';
import { BRAND } from '@/lib/constants/brand';

export const revalidate = 60;

export const metadata: Metadata = {
  title: `À propos — ${BRAND.name}`,
  description:
    'Intégrale est une plateforme de cours particuliers en ligne, mathématiques et physique-chimie, du lycée à la licence.',
  alternates: { canonical: '/about' },
};

const VALUES = [
  {
    title: 'Comprendre, pas seulement retenir',
    body:
      'Nos profs sont recrutés sur leur capacité à faire passer une idée, pas sur un classement. Une bonne réponse ne suffit pas — il faut une bonne explication.',
  },
  {
    title: 'Des maths et de la physique, au sérieux',
    body:
      'Pas de promesse miracle. Un programme aligné sur les attendus du lycée et des classes préparatoires, des exercices calibrés, des corrections rédigées.',
  },
  {
    title: 'La transparence, par défaut',
    body:
      'Prix clair par séance, créneau réel, facture envoyée. Pas d’abonnement caché, pas de commission opaque, pas d’effet de surprise.',
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <Section spacing="default" aria-labelledby="about-title">
        <Container size="prose">
          <SectionEyebrow label="À propos" />
          <Heading id="about-title" level="h1" className="mt-4">
            Une seule conviction&nbsp;: la qualité d’une explication
            change tout.
          </Heading>
          <p className="mt-5 text-base text-muted-foreground sm:text-lg">
            Intégrale est née à Paris en 2026 d’un constat simple&nbsp;:
            les élèves qui réussissent en sciences ne sont pas ceux qui
            passent le plus d’heures, ce sont ceux qui ont compris un
            bon prof, à un moment clé. Notre travail est de mettre ces
            profs devant chaque élève, en visio, au bon moment.
          </p>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Mathématiques, physique, chimie&nbsp;— du lycée à la
            licence. Pas de promesse miracle, pas de contenu
            préfabriqué. Un prof, un élève, un programme, et
            l’exigence qu’il faut.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/levels">
                Voir les niveaux
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/contact">Nous contacter</Link>
            </Button>
          </div>
        </Container>
      </Section>

      <Section spacing="default" tone="muted" aria-labelledby="values-title">
        <Container>
          <div className="mx-auto max-w-2xl">
            <SectionEyebrow number="01" label="Convictions" />
            <Heading id="values-title" level="h2" className="mt-3 text-3xl sm:text-4xl">
              Ce que nous défendons.
            </Heading>
          </div>

          <ul
            role="list"
            className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6"
          >
            {VALUES.map((v) => (
              <li
                key={v.title}
                className="flex flex-col gap-3 rounded-lg border bg-card p-6 shadow-sm"
              >
                <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  {v.title}
                </h3>
                <p className="text-pretty text-sm text-muted-foreground sm:text-base">
                  {v.body}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <CtaBand
        title="Réservez un premier cours gratuit"
        description="Un premier échange de 20 minutes pour cibler vos besoins, puis un créneau offert avec un prof vérifié."
        primaryHref="/contact"
        primaryLabel="Réserver mon créneau"
        secondaryHref="/pricing"
        secondaryLabel="Voir les tarifs"
      />
    </>
  );
}

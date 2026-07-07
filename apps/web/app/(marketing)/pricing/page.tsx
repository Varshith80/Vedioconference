import type { Metadata } from 'next';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { PageHeader } from '@/components/shared/page-header';
import { PricingTable } from '@/components/marketing/pricing-table';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Tarifs',
  description:
    'Trois formules : à la carte, pack 5 séances, mentorat continu. Tarif clair, facturation automatique, reçu envoyé par e-mail.',
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  return (
    <>
      <PageHeader
        title="Tarifs simples, sans surprise"
        description="Choisissez la formule qui correspond à votre besoin. Aucun engagement caché, facturation automatique, reçu envoyé par e-mail."
        breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'Tarifs' }]}
      />

      <Section spacing="default" aria-labelledby="pricing-tiers">
        <Container>
          <Heading id="pricing-tiers" level="h2" className="sr-only">
            Formules et tarifs
          </Heading>
          <PricingTable />
        </Container>
      </Section>

      <Section spacing="default" tone="muted" aria-labelledby="pricing-faq-title">
        <Container size="prose">
          <Heading id="pricing-faq-title" level="h2" className="text-center">
            Questions fréquentes
          </Heading>
          <dl className="mt-8 space-y-6">
            <div>
              <dt className="font-semibold text-foreground">Puis-je annuler une séance ?</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                Oui, jusqu’à 1 heure avant le début. Au-delà, la séance est due.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-foreground">Comment fonctionne le paiement ?</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                Stripe Checkout, sécurisé (Apple Pay, Google Pay, CB, SEPA). Vous recevez un reçu et une facture automatiquement.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-foreground">Le prix inclut-il les ressources ?</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                Oui, les supports partagés par le tuteur sont accessibles gratuitement pendant toute la durée du suivi.
              </dd>
            </div>
          </dl>
        </Container>
      </Section>
    </>
  );
}

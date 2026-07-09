import type { Metadata } from 'next';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { PageHeader } from '@/components/shared/page-header';
import { ContactForm } from '@/components/marketing/contact-form';
import { BRAND } from '@/lib/constants/brand';
import { Mail, MapPin, Phone } from 'lucide-react';

export const revalidate = 60;

export const metadata: Metadata = {
  title: `Contact — ${BRAND.name}`,
  description:
    'Contactez l’équipe Intégrale : demande d’information, niveau, premier cours offert. Réponse sous 24 heures ouvrées.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <>
      <PageHeader
        title="Nous contacter"
        description="Une question, un projet, un partenariat ? Nous lisons tout et revenons vers vous sous 24 heures ouvrées."
        breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'Contact' }]}
      />

      <Section spacing="default" aria-labelledby="contact-form-title">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <Heading id="contact-form-title" level="h2" className="text-2xl sm:text-3xl">
                Envoyez-nous un message
              </Heading>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Les champs marqués sont obligatoires.
              </p>
              <div className="mt-6">
                <ContactForm />
              </div>
            </div>

            <aside className="lg:col-span-5" aria-label="Coordonnées">
              <div className="rounded-xl border bg-muted/30 p-6 sm:p-8">
                <h2 className="text-base font-semibold text-foreground">Coordonnées directes</h2>
                <ul role="list" className="mt-4 space-y-4 text-sm">
                  <li className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
                    <div>
                      <p className="font-medium text-foreground">E-mail</p>
                      <a
                        href={`mailto:${BRAND.contactEmail}`}
                        className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {BRAND.contactEmail}
                      </a>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
                    <div>
                      <p className="font-medium text-foreground">Adresse</p>
                      <p className="text-muted-foreground">
                        {BRAND.addressLocality}, {BRAND.addressCountry}
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Phone className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
                    <div>
                      <p className="font-medium text-foreground">Support</p>
                      <p className="text-muted-foreground">
                        Du lundi au vendredi, 9h–18h. Réponse sous 24h.
                      </p>
                    </div>
                  </li>
                </ul>

                <div className="mt-6 rounded-md border bg-background p-4 text-xs text-muted-foreground">
                  <p>
                    Pour un problème technique sur une séance, merci d’utiliser
                    la <a href="/contact" className="underline">page de contact</a> en
                    précisant le n° de réservation. Ne partagez jamais votre mot
                    de passe.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </Container>
      </Section>
    </>
  );
}

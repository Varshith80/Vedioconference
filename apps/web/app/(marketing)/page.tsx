import type { Metadata } from 'next';
import { Hero } from '@/components/marketing/hero';
import { FeaturesGrid } from '@/components/marketing/features-grid';
import { TutorPreview } from '@/components/marketing/tutor-preview';
import { Testimonials } from '@/components/marketing/testimonials';
import { CtaBand } from '@/components/marketing/cta-band';
import { JsonLd } from '@/components/marketing/jsonld';
import { BRAND } from '@/lib/constants/marketing';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Cours particuliers en ligne pour lycée et classes prépa',
  description:
    'Plateforme de cours particuliers en visioconférence : tuteurs vérifiés, réservation en 60 secondes, paiement sécurisé. Lycée et classes préparatoires.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Vedioconference — Cours particuliers en ligne',
    description: 'Tuteurs vérifiés, réservation en 60 secondes, paiement sécurisé.',
    type: 'website',
    url: '/',
  },
};

export default function MarketingHomePage() {
  return (
    <>
      <Hero />
      <FeaturesGrid />
      <TutorPreview />
      <Testimonials />
      <CtaBand />

      <JsonLd
        id="org-jsonld"
        data={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: BRAND.legalName,
          url: '/',
          description: BRAND.shortDescription,
          email: BRAND.contactEmail,
          address: {
            '@type': 'PostalAddress',
            addressCountry: BRAND.addressCountry,
            addressLocality: BRAND.addressLocality,
          },
          sameAs: [BRAND.social.twitter, BRAND.social.linkedin],
        }}
      />
    </>
  );
}

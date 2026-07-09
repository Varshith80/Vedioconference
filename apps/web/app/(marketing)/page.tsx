import type { Metadata } from 'next';
import { Hero } from '@/components/marketing/hero';
import { LearningPaths } from '@/components/marketing/learning-paths';
import { TeachingMethod } from '@/components/marketing/teaching-method';
import { KeyFiguresBand } from '@/components/marketing/key-figures-band';
import { CtaBand } from '@/components/marketing/cta-band';
import { JsonLd } from '@/components/marketing/jsonld';
import { BRAND } from '@/lib/constants/brand';

export const revalidate = 60;

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description:
    'Cours particuliers en ligne, en visio, avec un prof vérifié — maths, physique et chimie du lycée à la licence.',
  alternates: { canonical: '/' },
  openGraph: {
    title: `${BRAND.name} — Comprendre, pas seulement retenir.`,
    description: BRAND.shortDescription,
    type: 'website',
    url: '/',
  },
};

/**
 * Marketing homepage. Sections are server-rendered and follow the
 * client brief verbatim (Section 01 — Parcours, Section 02 —
 * Méthode, Chiffres clés, CTA). Reordering any of these would
 * require a new client sign-off.
 */
export default function MarketingHomePage() {
  return (
    <>
      <Hero />
      <LearningPaths />
      <TeachingMethod />
      <KeyFiguresBand />
      <CtaBand
        title="Réservez un premier cours gratuit"
        description="Un premier échange de 20 minutes pour cibler vos besoins, puis un créneau offert avec un prof vérifié."
        primaryHref="/contact"
        primaryLabel="Réserver mon créneau"
        secondaryHref="/pricing"
        secondaryLabel="Voir les tarifs"
      />

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

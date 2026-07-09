import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Hero } from '@/components/marketing/hero';
import { LearningPaths } from '@/components/marketing/learning-paths';
import { TeachingMethod } from '@/components/marketing/teaching-method';
import { KeyFiguresBand } from '@/components/marketing/key-figures-band';
import { CtaBand } from '@/components/marketing/cta-band';
import { JsonLd } from '@/components/marketing/jsonld';
import { BRAND } from '@/lib/constants/brand';
import { getBrandCopy } from '@/lib/i18n/brand';
import { getLearningPaths, getMethodSteps, getKeyFigures } from '@/lib/i18n/paths';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const tBrand = await getTranslations('Brand');
  const brand = getBrandCopy(tBrand);
  const tHome = await getTranslations('Homepage');
  return {
    title: `${BRAND.name} — ${brand.tagline}`,
    description: brand.shortDescription,
    alternates: { canonical: '/' },
    openGraph: {
      title: `${BRAND.name} — ${tHome('headline')}`,
      description: brand.shortDescription,
      type: 'website',
      url: '/',
    },
  };
}

/**
 * Marketing homepage. Sections are server-rendered and follow the
 * client brief verbatim (Section 01 — Tracks, Section 02 — Method,
 * Key figures, CTA). Reordering any of these would require a new
 * client sign-off.
 */
export default async function MarketingHomePage() {
  const tHome = await getTranslations('Homepage');
  const tBrand = await getTranslations('Brand');
  const brand = getBrandCopy(tBrand);
  const paths = getLearningPaths(tHome);
  const steps = getMethodSteps(tHome);
  const figures = getKeyFigures(tHome);

  return (
    <>
      <Hero
        headline={tHome('headline')}
        subheadline={tHome('subheadline')}
        primaryLabel={tHome('ctaPrimary')}
        secondaryLabel={tHome('ctaSecondary')}
        socialProof={tHome('socialProof')}
      />
      <LearningPaths
        eyebrow={tHome('pathsEyebrow')}
        title={tHome('pathsTitle')}
        intro={tHome('pathsIntro')}
        seeAllLabel={tHome('seeAllLevels')}
        paths={paths}
      />
      <TeachingMethod
        eyebrow={tHome('methodEyebrow')}
        title={tHome('methodTitle')}
        intro={tHome('methodIntro')}
        steps={steps}
      />
      <KeyFiguresBand
        ariaLabel={tHome('figuresAria')}
        figures={figures}
      />
      <CtaBand
        title={tHome('ctaTitle')}
        description={tHome('ctaDescription')}
        primaryHref="/contact"
        primaryLabel={tHome('ctaButtonPrimary')}
        secondaryHref="/pricing"
        secondaryLabel={tHome('ctaButtonSecondary')}
      />

      <JsonLd
        id="org-jsonld"
        data={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: BRAND.legalName,
          url: '/',
          description: brand.shortDescription,
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

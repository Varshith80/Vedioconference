import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Hero } from '@/components/marketing/hero';
import { TrustBar } from '@/components/marketing/trust-bar';
import { FeaturedTutors } from '@/components/marketing/featured-tutors';
import { PopularCourses } from '@/components/marketing/popular-courses';
import { LearningPaths } from '@/components/marketing/learning-paths';
import { TeachingMethod } from '@/components/marketing/teaching-method';
import { Benefits } from '@/components/marketing/benefits';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { KeyFiguresBand } from '@/components/marketing/key-figures-band';
import { TestimonialsI18n } from '@/components/marketing/testimonials-i18n';
import { CtaBand } from '@/components/marketing/cta-band';
import { Faq } from '@/components/marketing/faq';
import { JsonLd } from '@/components/marketing/jsonld';
import { BRAND } from '@/lib/constants/brand';
import { getBrandCopy } from '@/lib/i18n/brand';
import {
  getLearningPaths,
  getMethodSteps,
  getKeyFigures,
  getTrustItems,
  getFeaturedTutors,
  getPopularCourses,
  getBenefits,
  getHowSteps,
  getTestimonials,
  getFaqItems,
  type LocalisedFeaturedTutor,
  type LocalisedPopularCourse,
} from '@/lib/i18n/paths';

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

function mapTutor(t: LocalisedFeaturedTutor) {
  return {
    slug: t.slug,
    name: t.name,
    headline: t.headline,
    bio: t.bio,
    rating: t.rating,
    sessions: t.sessions,
    subjects: t.subjects,
  };
}

function mapCourse(c: LocalisedPopularCourse) {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    summary: c.summary,
    level: c.level,
    track: c.track,
    duration: c.duration,
    price: c.price,
    accent: c.accent,
  };
}

/**
 * Marketing homepage. Composes the full SaaS marketing surface:
 * Hero → Trust bar → Featured tutors → Popular courses → Tracks
 * → Method → Benefits → How it works → Testimonials → Key figures
 * → FAQ → CTA band. All sections are server-rendered.
 */
export default async function MarketingHomePage() {
  const tHome = await getTranslations('Homepage');
  const tBrand = await getTranslations('Brand');
  const brand = getBrandCopy(tBrand);

  const paths = getLearningPaths(tHome);
  const steps = getMethodSteps(tHome);
  const figures = getKeyFigures(tHome);
  const trustItems = getTrustItems(tHome);
  const tutors = getFeaturedTutors(tHome).map(mapTutor);
  const courses = getPopularCourses(tHome).map(mapCourse);
  const benefits = getBenefits(tHome);
  const howSteps = getHowSteps(tHome);
  const testimonials = getTestimonials(tHome);
  const faqItems = getFaqItems(tHome);

  return (
    <>
      <Hero
        headline={tHome('headline')}
        subheadline={tHome('subheadline')}
        primaryLabel={tHome('ctaPrimary')}
        secondaryLabel={tHome('ctaSecondary')}
        socialProof={tHome('socialProof')}
      />

      <TrustBar items={trustItems} />

      <FeaturedTutors
        eyebrow={tHome('tutorsEyebrow')}
        title={tHome('tutorsTitle')}
        intro={tHome('tutorsIntro')}
        seeAllLabel={tHome('tutorsSeeAll')}
        seeAllHref="/tutors"
        tutors={tutors}
      />

      <PopularCourses
        eyebrow={tHome('coursesEyebrow')}
        title={tHome('coursesTitle')}
        intro={tHome('coursesIntro')}
        seeAllLabel={tHome('coursesSeeAll')}
        seeAllHref="/courses"
        courses={courses}
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

      <Benefits
        eyebrow={tHome('benefitsEyebrow')}
        title={tHome('benefitsTitle')}
        intro={tHome('benefitsIntro')}
        items={benefits}
      />

      <HowItWorks
        eyebrow={tHome('howEyebrow')}
        title={tHome('howTitle')}
        intro={tHome('howIntro')}
        steps={howSteps}
      />

      <TestimonialsI18n
        eyebrow={tHome('testimonialsEyebrow')}
        title={tHome('testimonialsTitle')}
        intro={tHome('testimonialsIntro')}
        items={testimonials}
      />

      <KeyFiguresBand
        ariaLabel={tHome('figuresAria')}
        figures={figures}
      />

      <Faq
        eyebrow={tHome('faqEyebrow')}
        title={tHome('faqTitle')}
        intro={tHome('faqIntro')}
        items={faqItems}
        contactLabel={tHome('faqContact')}
        contactHref="/contact"
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

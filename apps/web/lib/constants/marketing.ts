/**
 * Static marketing content. Kept in code (not in the DB) because:
 *   - The marketing site is identical for every visitor.
 *   - This avoids a public RLS read of `cms_*` tables in Phase 2.
 * Phase 4 may move these to a `marketing_pages` table for editor use.
 */

export const BRAND = {
  name: 'Vedioconference',
  tagline: 'Cours particuliers en visioconférence',
  shortDescription:
    'Plateforme de cours particuliers en ligne pour élèves de lycée et classes préparatoires. Réservez, payez, rejoignez la classe.',
  legalName: 'Vedioconference SAS',
  contactEmail: 'contact@example.com',
  supportEmail: 'support@example.com',
  addressCountry: 'FR',
  addressLocality: 'Paris',
  social: {
    twitter: 'https://twitter.com/vedioconference',
    linkedin: 'https://www.linkedin.com/company/vedioconference',
    github: 'https://github.com/vedioconference',
  },
} as const;

/** Top-level marketing navigation. Order matters on mobile. */
export const PRIMARY_NAV = [
  { label: 'Cours', href: '/courses' },
  { label: 'Tuteurs', href: '/tutors' },
  { label: 'Tarifs', href: '/pricing' },
  { label: 'À propos', href: '/about' },
  { label: 'Contact', href: '/contact' },
] as const;

export const FOOTER_NAV = {
  product: {
    title: 'Produit',
    links: [
      { label: 'Cours', href: '/courses' },
      { label: 'Tuteurs', href: '/tutors' },
      { label: 'Tarifs', href: '/pricing' },
      { label: 'Comment ça marche', href: '/about#how-it-works' },
    ],
  },
  company: {
    title: 'Société',
    links: [
      { label: 'À propos', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Témoignages', href: '/#testimonials' },
    ],
  },
  legal: {
    title: 'Légal',
    links: [
      { label: 'CGU', href: '/legal/terms' },
      { label: 'Confidentialité', href: '/legal/privacy' },
      { label: 'Mentions légales', href: '/legal/notice' },
    ],
  },
} as const;

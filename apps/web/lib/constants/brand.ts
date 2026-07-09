/**
 * Brand source of truth. This file is the single place where the
 * Intégrale brand identity lives. The marketing site, the
 * dashboard shell, the auth pages, the OG image, and the JSON-LD
 * all read from here. The values come from the client-provided
 * brand document (`charte-graphique-Integrale.docx`).
 *
 * Rule of thumb: components never hardcode a colour or a typeface.
 * They read from this file or from the CSS variables in
 * `styles/globals.css`, which are derived from the same hex codes.
 */

/** Hex codes (canonical). Keep in sync with the HSL tokens in `globals.css`. */
export const BRAND_COLORS = {
  bleuPlan:         '#142B4D', // primary — logo, dark surfaces, titles
  velin:            '#EDF0EA', // main background (graph-paper feel)
  vertReactif:      '#1F7A6C', // accent — links, buttons, OK
  ambreSurligneur:  '#E8A33D', // secondary accent — ≤ 1 per screen
  graphite:         '#2B2E33', // body text
  blancCarte:       '#FFFFFF', // card surfaces
} as const;

/** Type stack (locked). All three are loaded in `app/layout.tsx`. */
export const BRAND_FONTS = {
  serif: 'IBM Plex Serif', // display, titles, wordmark
  sans:  'IBM Plex Sans',  // body, UI
  mono:  'IBM Plex Mono',  // formulas, badges, numerals, level chips
} as const;

export const BRAND = {
  /** Canonical brand name. The wordmark renders this string with
   *  the second "e" replaced by a `∫` glyph (handled in `BrandMark`). */
  name: 'Intégrale',
  /** The wordmark text exactly as it should be displayed. */
  wordmark: 'Intégrale',
  /** Tagline shown under the wordmark and used as the default
   *  meta description. */
  tagline: 'Mathématiques · Physique-Chimie — du lycée à la licence',
  /** One-sentence description for JSON-LD and OG. */
  shortDescription:
    'Plateforme de cours particuliers en ligne, mathématiques et physique-chimie, du lycée à la licence.',
  /** Legal entity. */
  legalName: 'Intégrale SAS',
  /** Public-facing e-mail. Placeholder until the client provisions
   *  the project address. */
  contactEmail: 'contact@integrale.fr',
  supportEmail: 'support@integrale.fr',
  addressCountry: 'FR',
  addressLocality: 'Paris',
  /** Year shown in the copyright. */
  copyrightYear: 2026,
  social: {
    twitter:   'https://twitter.com/integrale',
    linkedin:  'https://www.linkedin.com/company/integrale',
    github:    'https://github.com/integrale',
  },
} as const;

/** The five top-level marketing pages, in the order they appear
 *  in the primary nav. The brief does not specify a nav, so this
 *  follows the page list the user gave us. The two legacy routes
 *  (`/courses`, `/tutors`) are reachable from the URL bar and
 *  from the sitemap, but are intentionally NOT in the nav. */
export const PRIMARY_NAV = [
  { label: 'Niveaux',  href: '/levels' },
  { label: 'Tuteurs',  href: '/tutors' },
  { label: 'Tarifs',   href: '/pricing' },
  { label: 'À propos', href: '/about' },
  { label: 'Contact',  href: '/contact' },
] as const;

/** Footer (single line, per the brief):
 *  Niveaux · Tarifs · Contact · Mentions légales · © 2026 Intégrale. */
export const FOOTER_LINKS = [
  { label: 'Niveaux',         href: '/levels' },
  { label: 'Tarifs',          href: '/pricing' },
  { label: 'Contact',         href: '/contact' },
  { label: 'Mentions légales', href: '/legal/notice' },
] as const;

/** The four learning paths. Single source for the home, the
 *  /levels page, and the dashboard. */
export const LEARNING_PATHS = [
  {
    id: 'lycee' as const,
    level: 'Lycée',
    badge: 'LYCÉE',
    headline: 'Seconde → Terminale',
    blurb:
      'Programme Spé Maths & Spé Physique-Chimie, préparation au Bac et à Parcoursup.',
    subjects: 'Maths · Physique-Chimie',
  },
  {
    id: 'prepa' as const,
    level: 'Prépa',
    badge: 'PRÉPA',
    headline: 'MPSI / PCSI / MP / PC',
    blurb:
      'Colles types, méthodes de rédaction et exercices calibrés difficulté concours.',
    subjects: 'Maths · Physique · Chimie',
  },
  {
    id: 'bts' as const,
    level: 'BTS',
    badge: 'BTS',
    headline: 'Filières industrielles',
    blurb:
      'Maths appliquées et sciences physiques ciblées sur les épreuves de BTS.',
    subjects: 'Maths · Sciences Physiques',
  },
  {
    id: 'licence' as const,
    level: 'Licence',
    badge: 'LICENCE',
    headline: 'L1 / L2 Sciences',
    blurb:
      'Analyse, algèbre, mécanique, thermodynamique — remise à niveau et approfondissement.',
    subjects: 'Maths · Physique · Chimie',
  },
] as const;
export type LearningPathId = (typeof LEARNING_PATHS)[number]['id'];

/** The three method bricks (Section 02 — Méthode). */
export const METHOD_STEPS = [
  {
    n: '01' as const,
    title: 'Cours en visio en direct',
    body:
      'Séances de 45 à 60 minutes avec un professeur, en petit groupe ou en individuel — vous posez vos questions en temps réel.',
  },
  {
    n: '02' as const,
    title: 'Exercices corrigés pas-à-pas',
    body:
      'Chaque correction détaille le raisonnement, pas seulement le résultat final.',
  },
  {
    n: '03' as const,
    title: 'Suivi de progression',
    body:
      'Un tableau de bord qui repère vos points faibles réels, séance après séance.',
  },
] as const;

/** The three key figures (Bleu Plan band). */
export const KEY_FIGURES = [
  { value: '3 400+', label: 'Exercices corrigés' },
  { value: '100%',   label: 'Cours en direct avec un prof' },
  { value: '4',      label: 'Niveaux · Lycée → Licence' },
] as const;

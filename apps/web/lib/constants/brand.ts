/**
 * Brand source of truth (structural only).
 *
 * This file is the single place where the **locale-agnostic**
 * Intégrale brand identity lives: the palette, the fonts, the
 * legal entity, the contact email, the address, the copyright
 * year, the social URLs. Everything in here is identical in every
 * language.
 *
 * Locale-specific strings — the tagline, the short description,
 * the primary nav, the footer links, the learning paths, the
 * method steps, the key figures — live in `messages/<locale>.json`
 * and are read via the helpers in `lib/i18n/` (e.g.
 * `getBrandCopy(t)`, `getLearningPaths(t)`).
 *
 * The marketing site, the dashboard shell, the auth pages, the OG
 * image, and the JSON-LD all read from either here (structural)
 * or the message files (localised). Components never hardcode a
 * colour, a typeface, or a user-facing string.
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

/** Type stack (locked). All three are loaded in `app/[locale]/layout.tsx`. */
export const BRAND_FONTS = {
  serif: 'IBM Plex Serif', // display, titles, wordmark
  sans:  'IBM Plex Sans',  // body, UI
  mono:  'IBM Plex Mono',  // formulas, badges, numerals, level chips
} as const;

/**
 * Structural brand identity. **No localised strings live here.**
 * For the tagline and the short description, use `getBrandCopy(t)`
 * from `lib/i18n/brand.ts`.
 */
export const BRAND = {
  /** Canonical brand name. The wordmark renders this string with
   *  the second "e" replaced by a `∫` glyph (handled in `BrandMark`). */
  name: 'Intégrale',
  /** The wordmark text exactly as it should be displayed. */
  wordmark: 'Intégrale',
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

/**
 * Stable, locale-agnostic identifier for each learning path.
 * The `id` is the handle used in URLs, analytics, and DB foreign
 * keys; the localised copy (`level`, `badge`, `headline`, `blurb`,
 * `subjects`) lives in `messages/<locale>.json` under
 * `Homepage.paths`.
 */
export type LearningPathId = 'lycee' | 'prepa' | 'bts' | 'licence';

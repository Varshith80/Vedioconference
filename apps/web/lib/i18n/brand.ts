/**
 * Localised brand copy helpers.
 *
 * `lib/constants/brand.ts` holds the *structural* brand identity
 * (palette, fonts, legal name, contact email, social URLs, country,
 * locality, copyright year) — values that are identical in every
 * locale. Anything locale-specific lives in `messages/<locale>.json`
 * under the `Brand` namespace, and components read it via these
 * helpers.
 *
 * Three call sites are supported:
 *  - React Server Components: `getBrandCopy(t)` — pass the translator
 *    returned by `getTranslations('Brand')`.
 *  - Client components:       `useBrandCopy()` — pulls the translator
 *    from `useTranslations` for you.
 *  - Edge runtime (OG image): `brandFromMessages(messages)` — pass the
 *    raw messages object; no next-intl runtime needed.
 *
 * Rule of thumb: do not import a literal string from anywhere in the
 * marketing surface. Read it from `messages/<locale>.json` via one of
 * these three functions.
 */
import { BRAND as STRUCTURAL } from '@/lib/constants/brand';

type RawMessages = {
  Brand?: {
    tagline?: string;
    shortDescription?: string;
    ogCaption?: string;
  };
};

export type BrandCopy = typeof STRUCTURAL & {
  tagline: string;
  shortDescription: string;
  ogCaption: string;
};

/**
 * Imperative form — used inside RSC pages.
 *
 * @example
 *   const t = await getTranslations('Brand');
 *   const brand = getBrandCopy(t);
 *   <title>{brand.tagline}</title>
 */
export function getBrandCopy(t: (key: 'tagline' | 'shortDescription' | 'ogCaption') => string): BrandCopy {
  return {
    ...STRUCTURAL,
    tagline: t('tagline'),
    shortDescription: t('shortDescription'),
    ogCaption: t('ogCaption'),
  };
}

/**
 * Edge-runtime form — used inside `app/opengraph-image.tsx`.
 * The OG image runs on the edge and cannot use next-intl's React
 * providers, so it imports the raw messages object directly.
 */
export function brandFromMessages(messages: RawMessages): BrandCopy {
  const b = messages.Brand ?? {};
  return {
    ...STRUCTURAL,
    // The structural BRAND intentionally omits `tagline`,
    // `shortDescription`, and `ogCaption` — they are content, not
    // brand identity. The translations are the only source of truth;
    // if a translation is missing, we fall back to the empty string
    // rather than synthesising a value.
    tagline: b.tagline ?? '',
    shortDescription: b.shortDescription ?? '',
    ogCaption: b.ogCaption ?? '',
  };
}

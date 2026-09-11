/**
 * Locale-aware formatting helpers.
 *
 * Every formatter in this module takes an explicit `locale` of type
 * `Locale` (the same narrow `'en' | 'fr'` union exported by `@/i18n`).
 * There is no silent default: forcing callers to pass the active
 * application locale is the contract that prevents EN pages from
 * accidentally inheriting the French decimal-comma formatting (or
 * vice-versa) when the marketing surface and the data layer live
 * in different parts of the tree.
 *
 * `Intl.NumberFormat` is used for currency so both the symbol
 * placement (`€35.00` vs `35,00 €`) and the decimal separator
 * (`.` vs `,`) are picked by the runtime, not hard-coded.
 */
import type { Locale } from '@/i18n';

/**
 * Format an integer number of cents as a localized currency string
 * with NO decimal places. The product spec calls for whole-euro
 * display: the underlying value stays in cents (e.g. 3500, 29900,
 * 10900) and the formatter drops the trailing `.00` / `,00` so
 * both EN and FR render the canonical "€35 / €299 / €109" form.
 *
 *   formatCents(3500,  'EUR', 'en') → "€35"
 *   formatCents(3500,  'EUR', 'fr') → "35 €"
 *   formatCents(29900, 'EUR', 'en') → "€299"
 *   formatCents(29900, 'EUR', 'fr') → "299 €"
 *   formatCents(10900, 'EUR', 'en') → "€109"
 *   formatCents(10900, 'EUR', 'fr') → "109 €"
 *
 * Why no decimals: per the marketing / pricing brief, the visible
 * product price is always a whole euro. The cents-precision
 * representation is still the source of truth — the database,
 * Stripe, session grants, and any downstream charge all see
 * the integer-cent value. Only the human-facing display is
 * rounded to whole euros.
 *
 * If a future surface ever needs cents (e.g. an invoice line
 * with tax breakdown), add a separate `formatCentsPrecise()`
 * helper rather than relaxing this one.
 */
export function formatCents(
  cents: number,
  currency: string = 'EUR',
  locale: Locale,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Format an ISO date as a localized date string. */
export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
    new Date(iso),
  );
}

/** Format an ISO date as a localized date+time string. */
export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(iso));
}

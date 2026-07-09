/**
 * Server-side i18n helpers for route handlers and RSC pages that
 * live *outside* the `[locale]` tree (the API routes, the root
 * not-found, the OG image).
 *
 * next-intl's `useTranslations` / `getTranslations` only work inside
 * the locale tree, so route handlers that need to localise their
 * response strings import the raw message maps here and look up
 * the active locale from the `NEXT_LOCALE` cookie (set by the
 * middleware) or the `Accept-Language` header (a safe fallback).
 *
 * Usage:
 *   import { getApiTranslator, tForLocale } from '@/lib/i18n/server';
 *
 *   // In a route handler that has a NextRequest:
 *   const t = await getApiTranslator(req);
 *   return NextResponse.json({ ok: true, message: t('ApiErrors.sendFailed') });
 *
 *   // Or pick a locale directly:
 *   const t = tForLocale('fr');
 *   return t('ApiErrors.rateLimited');
 */
import { type NextRequest } from 'next/server';
import { defaultLocale, locales, type Locale } from '@/i18n';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';

type Messages = Record<string, unknown>;

const DICTS: Record<Locale, Messages> = { en, fr };

/**
 * Flatten a nested object into a dot-notation map. Arrays and
 * primitive values are preserved; only object keys are flattened.
 * Example: { a: { b: 'c' } } → { 'a.b': 'c' }.
 */
function flatten(obj: Messages, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v as Messages, key, out);
    } else if (typeof v === 'string') {
      out[key] = v;
    }
  }
  return out;
}

const FLAT: Record<Locale, Record<string, string>> = {
  en: flatten(en as Messages),
  fr: flatten(fr as Messages),
};

/** Pick the active locale for an incoming request. */
function pickLocale(req: NextRequest): Locale {
  const cookie = req.cookies.get('NEXT_LOCALE')?.value;
  if ((locales as readonly string[]).includes(cookie ?? '')) {
    return cookie as Locale;
  }
  const accept = (req.headers.get('accept-language') ?? '').toLowerCase();
  if (accept.startsWith('fr')) return 'fr';
  if (accept.startsWith('en')) return 'en';
  return defaultLocale;
}

/**
 * Returns a `t(key)` function bound to the active locale for a
 * given request. Falls back to English when the key is missing in
 * the active locale, and to the key string when the key is missing
 * in both.
 */
export async function getApiTranslator(
  req: NextRequest,
): Promise<(key: string) => string> {
  const locale = pickLocale(req);
  return tForLocale(locale);
}

/** Build a translator for a specific locale (no request needed). */
export function tForLocale(locale: Locale): (key: string) => string {
  const primary = FLAT[locale] ?? FLAT[defaultLocale];
  const fallback = FLAT[defaultLocale];
  return (key: string) => primary[key] ?? fallback[key] ?? key;
}

/**
 * The two raw message maps, exposed for callers that need to look
 * up structured values (arrays, nested objects) — for example the
 * OG image, which renders `Brand.ogCaption` directly.
 */
export const MESSAGES: Record<Locale, Messages> = DICTS;

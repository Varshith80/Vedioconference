import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

/**
 * The locales the app supports. Adding a new locale (e.g. 'es') is
 * a content operation: copy `messages/en.json` to `messages/es.json`,
 * translate every value, then add 'es' to this list and to the
 * language switcher.
 */
export const locales = ['en', 'fr'] as const;
export type Locale = (typeof locales)[number];

/** Type guard for the supported locales. */
export function isLocale(s: string | null | undefined): s is Locale {
  return typeof s === 'string' && (locales as readonly string[]).includes(s);
}

/** Default locale when no Accept-Language header and no cookie
 *  are present. Per the product brief, English is the default. */
export const defaultLocale: Locale = 'en';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = (locales as readonly string[]).includes(requested ?? '')
    ? (requested as Locale)
    : defaultLocale;

  let messages: Record<string, unknown>;
  try {
    messages = (await import(`./messages/${locale}.json`)).default;
  } catch {
    notFound();
  }

  return {
    locale,
    messages,
  };
});

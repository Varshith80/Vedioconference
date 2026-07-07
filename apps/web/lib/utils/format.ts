/** Format an integer number of cents as a localized currency string. */
export function formatCents(cents: number, currency = 'EUR', locale = 'fr-FR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

/** Format an ISO date as a localized date string. */
export function formatDate(iso: string, locale = 'fr-FR'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(iso));
}

/** Format an ISO date as a localized date+time string. */
export function formatDateTime(iso: string, locale = 'fr-FR'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));
}

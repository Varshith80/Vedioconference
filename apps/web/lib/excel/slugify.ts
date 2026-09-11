// =====================================================================
// `lib/excel/slugify.ts` — single source of truth for the slug
// normalisation used by the Excel importer.
//
// The importer keys every row on a natural key whose value is
// derived from the workbook via slugify. A change here is a
// breaking change for every existing DB row; bumping the
// canonicalisation function is intentionally a separate
// concern from this file.
//
// The function is small, pure, and dependency-free so it can
// be imported by both the parser and the importer-only alias
// module without introducing a circular import.
// =====================================================================

/**
 * Normalise a human title into a DB-safe slug.
 *
 * The transformation is: NFD + strip combining marks to fold
 * accents to ASCII, lowercase, collapse any run of
 * non-[a-z0-9] into a single '-', trim leading/trailing '-',
 * cap at 120 chars.
 *
 * Pure: no I/O, no Math.random, no Date.now.
 */
export function slugify(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFD') // split "é" -> "e" + combining accent
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // any run of non-[a-z0-9] -> "-"
    .replace(/^-+|-+$/g, '') // trim leading/trailing "-"
    .slice(0, 120); // DB column max
}

// =====================================================================
// `lib/i18n/localized-title.ts` — render the right title per locale.
//
// The importer (apps/web/lib/excel/import.ts) writes
// `metadata.titles[locale]` on every catalog row, where
// `locale` is the language of the workbook that produced the
// row ('en' or 'fr'). This helper reads that field at render
// time and falls back to `row.title` if the locale is missing
// or the metadata is absent.
//
// Legacy path
// -----------
// A previous importer (the CJS prototype used to seed the
// remote DB) wrote FR titles at `metadata.fr.title` instead
// of `metadata.titles.fr.title`. The current importer writes
// to the canonical `metadata.titles` path, but the legacy
// data is still in the DB and we cannot drop it. This helper
// therefore reads `metadata.titles[locale].title` first, then
// falls back to `metadata[locale].title` (the legacy shape),
// then to `row.title`. The fallback chain is:
//   1. metadata.titles[locale].title   (canonical, current)
//   2. metadata[locale].title          (legacy, pre-v2.0 importer)
//   3. row.title                       (DB row's own string)
//   4. ''                              (row is null/undefined)
// The legacy path is read-only at runtime — no write path
// uses it — and is removed once the historical FR data is
// re-imported under the canonical key. The migration is
// tracked separately and is out of scope here.
//
// Why a helper (and not just `row.metadata?.titles?.[locale]?.title`)
// -------------------------------------------------------------------
// Two reasons:
//   1. The `metadata` column is typed as `Record<string, unknown> |
//      null` on every domain type. Reaching into it at every
//      render call site would scatter `as` casts and brittle
//      type guards. The helper centralises the access pattern.
//   2. The fallback chain (locale → legacy → row.title → '')
//      is a single decision that the helper documents. A
//      render call site that needs "the title" should not
//      need to know about JSONB shapes.
//
// Runtime vs. importer
// --------------------
// This file is in `lib/i18n/`, NOT in `lib/excel/`. It is
// imported by every catalog-reading page (marketing and
// dashboard) AND by the importer's tests. The importer-only
// slug alias is in `lib/excel/program-slug-alias.ts` and never
// reaches this path.
// =====================================================================

import type { Locale } from '@/i18n';

// The `metadata.titles` shape the importer writes. The runtime
// helper does the structural narrowing at the call site so the
// domain row types (which declare `metadata` as
// `Record<string, unknown> | null` / `Json`) flow through
// without a cast.
type LocalizedTitleEntry = { title: string; slug?: string };
type LocalizedTitlesShape = Partial<Record<Locale, LocalizedTitleEntry>>;

// A catalog row that has a `title` and may carry
// `metadata.titles[locale].title`. The `metadata` field is
// typed as `unknown` because the Supabase generated `Json`
// type is recursive and very wide; the helper does a narrow
// read of `metadata.titles[locale].title` and falls back if
// the structure is wrong.
interface LocalizableRow {
  title: string;
  metadata?: unknown;
}

/**
 * Returns the locale-specific title for a catalog row, or the
 * row's own `title` as a fallback, or an empty string if the
 * row is null/undefined. Never throws.
 *
 * Fallback chain:
 *   1. `metadata.titles[locale].title`   (canonical)
 *   2. `metadata[locale].title`          (legacy, pre-v2.0 importer)
 *   3. `row.title`                       (DB row's own string)
 *   4. `''`                              (row is null/undefined)
 *
 * Examples:
 *   localizedTitle({ title: 'MATHEMATICS',
 *                    metadata: { titles: { fr: { title: 'MATHÉMATIQUES' } } } },
 *                  'fr') // → 'MATHÉMATIQUES'
 *
 *   localizedTitle({ title: 'MATHEMATICS',
 *                    metadata: { fr: { title: 'MATHÉMATIQUES' } } },
 *                  'fr') // → 'MATHÉMATIQUES' (legacy path)
 *
 *   localizedTitle({ title: 'MATHEMATICS' }, 'fr') // → 'MATHEMATICS'
 *
 *   localizedTitle(null, 'fr') // → ''
 */
export function localizedTitle(
  row: LocalizableRow | null | undefined,
  locale: Locale,
): string {
  if (!row) return '';
  const titles = readTitlesObject(row.metadata);
  if (titles) {
    const entry = titles[locale];
    if (entry && typeof entry.title === 'string' && entry.title.length > 0) {
      return entry.title;
    }
  }
  // Legacy path: some historical rows carry `metadata.fr.title`
  // (or `metadata.en.title`) directly. Read it before falling
  // through to `row.title` so the FR locale renders FR strings
  // for these rows.
  const legacy = readLegacyLocaleTitle(row.metadata, locale);
  if (legacy) return legacy;
  return row.title;
}

/**
 * Read `metadata.titles` from an opaque metadata value. Returns
 * the titles object when it has the expected shape, else null.
 * Tolerant of legacy / foreign JSON shapes — never throws.
 */
function readTitlesObject(
  metadata: unknown,
): LocalizedTitlesShape | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as { titles?: unknown };
  if (!m.titles || typeof m.titles !== 'object') return null;
  const out: LocalizedTitlesShape = {};
  for (const k of Object.keys(m.titles) as Locale[]) {
    const v = (m.titles as Record<string, unknown>)[k];
    if (v && typeof v === 'object') {
      const t = (v as { title?: unknown }).title;
      if (typeof t === 'string') {
        out[k] = { title: t };
      }
    }
  }
  return out;
}

/**
 * Legacy fallback: read `metadata[locale].title` from an opaque
 * metadata value. The pre-v2.0 importer wrote FR titles to this
 * path; the current importer writes to `metadata.titles[locale]`.
 * Tolerant of legacy / foreign JSON shapes — never throws.
 * Returns the title string or null if the path is absent or
 * malformed.
 */
function readLegacyLocaleTitle(
  metadata: unknown,
  locale: Locale,
): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  const entry = m[locale];
  if (!entry || typeof entry !== 'object') return null;
  const t = (entry as { title?: unknown }).title;
  if (typeof t === 'string' && t.length > 0) return t;
  return null;
}

/**
 * Variant of `localizedTitle` for collections: takes an array
 * of rows and returns a parallel array of locale-specific
 * titles. Each call falls back to the row's own title. Useful
 * for list rendering (e.g. `<ChapterList chapters={displayChapterTitles(chapters, locale)} />`).
 */
export function localizedTitles<T extends LocalizableRow>(
  rows: ReadonlyArray<T>,
  locale: Locale,
): ReadonlyArray<string> {
  return rows.map((r) => localizedTitle(r, locale));
}

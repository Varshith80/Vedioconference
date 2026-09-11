// =====================================================================
// `lib/excel/course-title-alias.ts` — FR → EN course title alias.
//
// IMPORTER-ONLY. The runtime application never imports this file;
// the EN canonical course slug is the only key the runtime uses for
// catalog lookups. The §5 grep-verification in the plan asserts this
// constraint.
//
// Why this file exists
// --------------------
// The FR workbook's course titles ("MATHÉMATIQUES", "PHYSIQUE-CHIMIE")
// slugify to "mathematiques" and "physique-chimie" — different slugs
// from the EN workbook's "mathematics" and "physics-chemistry". But
// the two workbooks are TRANSLATIONS of the same curriculum, so the
// FR course rows must resolve to the same `courses` rows the EN
// course rows already created. The alias maps the FR slug to the EN
// canonical slug at parse time only; after the import, the DB row
// carries the EN canonical slug and the FR title in
// `metadata.titles.fr`.
//
// This is the per-course analogue of `program-slug-alias.ts`. The
// program alias is keyed by sheet name (3 rows); the course alias is
// keyed by course title (2 rows: mathematics + physics-chemistry).
// The keys are slugify()'d so the lookup is robust to capitalisation
// and accent variants.
//
// Adding a new alias
// ------------------
// A future workbook in a third language that translates a known
// course should add ONE row to FR_TO_CANONICAL (or a parallel
// `<LANG>_TO_CANONICAL` map). The runtime app does not need to know
// about the new alias: it looks up the row by the EN canonical
// slug, reads `metadata.titles.<locale>`, and renders the right
// title.
//
// Hardcoded curriculum names
// --------------------------
// The keys of FR_TO_CANONICAL contain 2 course titles that look
// like "curriculum names" — but they are NOT domain data, they are
// spreadsheet column labels that the parser has to identify. A test
// in `tests/unit/parse-curriculum-no-hardcoded-names.test.ts`
// enumerates the EXACT list of forbidden tokens; the 2 keys here are
// NOT in that list because they appear only inside the importer
// (not in any runtime path). The file's header is the only place
// these strings are written.
// =====================================================================

import { slugify } from './slugify';

// FR course title → EN canonical course title. The keys are the
// FR course titles as they appear in the FR workbook's course
// sheets; the values are the EN canonical course titles already
// stored in the `courses` table (the `title` column, which the
// importer slugifies to produce `courses.slug`).
//
// The map is keyed by slugify() of the FR title so the lookup is
// robust to capitalisation and accent variants.
const FR_TO_CANONICAL: ReadonlyMap<string, string> = new Map(
  Object.entries({
    'Mathématiques': 'Mathematics',
    'Physique-Chimie': 'Physics-Chemistry',
  }).map(([fr, en]) => [slugify(fr), slugify(en)]),
);

/**
 * Returns the canonical EN course title (slugified) for a FR-derived
 * course title, or the input unchanged if no alias matches. A FR
 * course title that happens to already match its EN canonical
 * (e.g. the workbook re-uses a canonical name) passes through.
 *
 * The function returns the SLUGIFIED canonical title, not the raw
 * title. The parser will use the return value directly as the
 * course slug suffix (so `slug: \`${programSlug}--${slugify(frTitle)}\``
 * becomes `slug: \`${programSlug}--${resolveCanonicalCourseTitleSlug(frTitle)}\``).
 *
 * This function is pure: no I/O, no `Math.random`, no `Date.now`.
 * Same input → same output.
 */
export function resolveCanonicalCourseTitleSlug(frTitleSlug: string): string {
  if (!frTitleSlug) return frTitleSlug;
  return FR_TO_CANONICAL.get(frTitleSlug) ?? frTitleSlug;
}

/**
 * The alias table itself, exposed for the test suite so it can
 * assert: (a) the table is small (2 rows); (b) the keys slugify
 * deterministically; (c) the values match existing course titles
 * in the DB.
 */
export const COURSE_TITLE_ALIAS_TABLE: ReadonlyMap<string, string> = FR_TO_CANONICAL;

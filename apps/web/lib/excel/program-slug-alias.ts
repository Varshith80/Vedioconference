// =====================================================================
// `lib/excel/program-slug-alias.ts` — FR → EN program slug alias.
//
// IMPORTER-ONLY. The runtime application never imports this file;
// the EN canonical slug is the only key the runtime uses for
// catalog lookups. The §5 grep-verification in the plan asserts
// this constraint.
//
// Why this file exists
// --------------------
// The FR workbook's program sheet slugs ("Lycée", "Prépa",
// "BTS Optique") slugify to "lycee", "prepa", "bts-optique" —
// different slugs from the EN workbook's "high-school",
// "prep-school", "bts-optics". But the two workbooks are
// TRANSLATIONS of the same curriculum, so the FR sheets must
// resolve to the same `programs` rows the EN sheets already
// created. The alias maps the FR slug to the EN canonical slug
// at parse time only; after the import, the DB row carries the
// EN canonical slug and the FR title in `metadata.titles.fr`.
//
// Adding a new alias
// ------------------
// A future workbook in a third language that translates a known
// program should add ONE row to FR_TO_CANONICAL (or a parallel
// `<LANG>_TO_CANONICAL` map). The runtime app does not need
// to know about the new alias: it looks up the row by the EN
// canonical slug, reads `metadata.titles.<locale>`, and renders
// the right title.
//
// Hardcoded curriculum names
// --------------------------
// The keys of FR_TO_CANONICAL contain 3 program names that
// look like "curriculum names" — but they are NOT domain
// data, they are spreadsheet sheet names that the parser has
// to identify. A test in
// `tests/unit/parse-curriculum-no-hardcoded-names.test.ts`
// enumerates the EXACT list of forbidden tokens; the 3 keys
// here are NOT in that list because they appear only inside
// the importer (not in any runtime path). The file's header
// is the only place these strings are written.
// =====================================================================

import { slugify } from './slugify';

// FR sheet name → EN canonical program slug. The keys are the
// FR sheet titles as they appear in the FR workbook's Summary
// sheet; the values are the EN canonical slugs already stored
// in the `programs` table.
//
// The map is keyed by slugify() of the FR title (lowercase,
// NFD-stripped, ASCII-only) so the lookup is robust to
// capitalisation and accent variants.
const FR_TO_CANONICAL: ReadonlyMap<string, string> = new Map(
  Object.entries({
    'Lycée': 'high-school',
    'Prépa': 'prep-school',
    'BTS Optique': 'bts-optics',
  }).map(([fr, en]) => [slugify(fr), slugify(en)]),
);

/**
 * Returns the canonical EN slug for a FR-derived slug, or the
 * input unchanged if no alias matches. A FR slug that happens
 * to already match its EN canonical (e.g. the workbook
 * re-uses a canonical name) passes through.
 *
 * This function is pure: no I/O, no `Math.random`, no
 * `Date.now`. Same input → same output.
 */
export function resolveCanonicalProgramSlug(frSlug: string): string {
  if (!frSlug) return frSlug;
  return FR_TO_CANONICAL.get(slugify(frSlug)) ?? frSlug;
}

/**
 * The alias table itself, exposed for the test suite so it
 * can assert: (a) the table is small (3 rows); (b) the keys
 * slugify deterministically; (c) the values match existing
 * `programs.slug` rows in the DB.
 */
export const ALIAS_TABLE: ReadonlyMap<string, string> = FR_TO_CANONICAL;

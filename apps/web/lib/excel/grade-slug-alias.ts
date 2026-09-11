// Importer-only. Maps the FR workbook's grade slugs to the
// EN canonical grade slugs already stored in the DB. The runtime
// app never imports this file — the EN canonical slug is the
// only key the runtime uses for catalog lookups. See
// `parse-curriculum-no-hardcoded-names.test.ts` for the grep
// verification of the import-graph.
import { slugify } from './slugify';

const FR_TO_CANONICAL: ReadonlyMap<string, string> = new Map(
  Object.entries({
    'premiere-algebre-analyse': 'grade-11-algebra-analysis',
    'premiere-geometrie-probabilites': 'grade-11-geometry-probability',
    'terminale-spe-analyse': 'grade-12-specialty-analysis',
    'terminale-spe-geometrie-probabilites': 'grade-12-specialty-geometry-probability',
  }).map(([fr, en]) => [slugify(fr), slugify(en)]),
);

// Returns the canonical EN slug for a FR-derived slug, or the
// input unchanged if no alias matches. A FR slug that happens to
// already match its EN canonical (e.g. the workbook re-uses a
// canonical name) passes through.
export function resolveCanonicalGradeSlug(frSlug: string): string {
  return FR_TO_CANONICAL.get(slugify(frSlug)) ?? frSlug;
}

// Used by the test suite to assert that the alias table is small
// and contains no curriculum names beyond the canonical pairings.
export const GRADE_ALIAS_TABLE: ReadonlyMap<string, string> = FR_TO_CANONICAL;

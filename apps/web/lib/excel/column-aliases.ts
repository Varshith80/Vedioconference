// Column-alias table: maps the localized header text that
// appears in the program sheets to the canonical English
// field name the parser keys off. Two languages today (en,
// fr) but the table is open-ended — a new workbook in a
// third language only needs a new column added here.
//
// The headers are taken from the R10 anchor row of each
// program sheet (see docs/imports/excel-shape.md §5). The
// parser is data-driven: it never hardcodes a curriculum
// name. It only keys
// off these 7 canonical fields (one per visible column in
// the data rows).
//
// When the parser encounters an unknown header, it raises
// an error. The two reference workbooks (EN + FR) must
// both be parseable with the same canonical field names.

export type CanonicalField =
  | 'position'      // Col 2: session number within the chapter
  | 'block'         // Col 3: Block grouping (or grade hint for programs with grades)
  | 'chapter'       // Col 4: chapter title
  | 'session'       // Col 5: session title
  | 'lecture_hrs'   // Col 6: lecture hours (int)
  | 'exercise_hrs'  // Col 7: exercise hours (int)
  | 'total_hrs';    // Col 8: formula, DROPPED by the parser

// Map<CanonicalField, ReadonlyArray<string>>
// The arrays are case-insensitive; the parser trims
// whitespace before lookup.
export const COLUMN_ALIASES: Readonly<Record<CanonicalField, ReadonlyArray<string>>> = {
  position:     ['No.', 'N°', 'No'],
  block:        ['Block', 'Bloc'],
  chapter:      ['Chapter', 'Chapitre'],
  session:      ['Session', 'Séance'],
  lecture_hrs:  ['Lecture hrs', 'H. cours', 'H.cours', 'H cours'],
  exercise_hrs: ['Exercise hrs', 'H. exercices', 'H.exercices', 'H exercices'],
  total_hrs:    ['Total hrs', 'H. totales', 'H.totales', 'H totales'],
};

// Map<Language, ReadonlyArray<CanonicalField>>
// The Summary sheet header row (R4) uses different
// canonical fields. Today the Summary sheet carries the
// program list (not the per-column data block), so this
// only needs to map the 5 program-level header cells.
export const SUMMARY_COLUMN_ALIASES: Readonly<Record<'en' | 'fr', ReadonlyArray<string>>> = {
  en: ['Level / Track', 'Description', 'Total hours/year', 'Pace (hrs/week)'],
  fr: ['Level / Filière', 'Description', 'Heures totales/an', 'Rythme (h/sem.)'],
};

// Map a header text to a canonical field. The lookup is
// case-insensitive and ignores surrounding whitespace.
// Returns null on no match (caller decides how to react).
export function resolveColumn(header: string): CanonicalField | null {
  const normalised = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as Array<[CanonicalField, ReadonlyArray<string>]>) {
    for (const alias of aliases) {
      if (alias.trim().toLowerCase() === normalised) return field;
    }
  }
  return null;
}

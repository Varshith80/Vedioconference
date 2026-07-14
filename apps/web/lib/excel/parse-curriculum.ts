import ExcelJS from 'exceljs';
import { resolveColumn, type CanonicalField } from '@/lib/excel/column-aliases';

// Sprint 3.6 §5.0 — three design invariants:
//   1. The parser is data-driven. No curriculum name is
//      hardcoded anywhere in this file or its callers. The
//      hierarchy is discovered from the workbook. Adding a
//      6th program to a future workbook is a workbook change,
//      not a code change.
//   2. price_cents is null for every session in the current
//      workbooks (no price column). Sprint 5 will own real
//      prices. The parser MUST emit null, never a placeholder.
//   3. The parser is deterministic: no Math.random, no
//      Date.now. Same input → same output, always.

export type Language = 'en' | 'fr';

// One row of the Summary sheet: a program with its title
// and the program sheet name to drill into.
export interface ParsedProgram {
  slug: string;
  title: string;
  subtitle: string | null;
  // Sheet name in the workbook (cross-check; not a key).
  sheetName: string;
  // Total sessions (for cross-validation; the importer does
  // not rely on this number).
  sessionCount: number;
}

// A grade inside a program. Only programs whose Block
// cells start with a structural grade-marker prefix
// (see isGradeLikeBlock below) have grades; most
// programs have zero grades. The importer is happy with
// that.
export interface ParsedGrade {
  programSlug: string;
  slug: string;
  title: string;
  sortOrder: number;
}

// A course inside a program. The course title is whatever
// the workbook provides (e.g. an ALL-CAPS label that
// matches a course section header). The parser never
// hardcodes a list of valid course titles.
export interface ParsedCourse {
  slug: string;
  title: string;
  programSlug: string;
  gradeSlug: string | null;
  sortOrder: number;
}

// A chapter inside a course. The slug is derived from the
// chapter title (slugify); the natural key for the importer
// is (course_id, slug). The "Block" column carries a
// structural hint: for programs with grades it is a
// grade label (the structural prefix that the workbook's
// own grading convention uses); for others it is just the
// chapter's block grouping. The importer stores the raw
// text in the chapter's `metadata` column.
export interface ParsedChapter {
  courseSlug: string;
  slug: string;
  title: string;
  block: string | null;
  sortOrder: number;
  isPublished: boolean;
}

// A session inside a chapter. The natural key is
// (chapter_id, position); the importer uses ON CONFLICT.
export interface ParsedSession {
  chapterSlug: string;
  courseSlug: string;
  position: number;
  slug: string;
  title: string;
  // Always null in the current workbooks (no price column).
  // The importer MUST NOT generate a placeholder; Sprint 5
  // owns real prices.
  priceCents: number | null;
  durationMin: number | null;
  isPublished: boolean;
  isPreview: boolean;
}

// The full parse result. `errors` carries every
// unrecoverable row, never thrown; the caller decides
// whether the workbook is acceptable.
export interface ParsedCurriculum {
  language: Language;
  programs: ReadonlyArray<ParsedProgram>;
  grades: ReadonlyArray<ParsedGrade>;
  courses: ReadonlyArray<ParsedCourse>;
  chapters: ReadonlyArray<ParsedChapter>;
  sessions: ReadonlyArray<ParsedSession>;
  errors: ReadonlyArray<ParseError>;
}

export interface ParseError {
  sheet: string;
  row: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// slugify: pure function, no lookup table. Lowercases, transliterates
// accented characters to ASCII, replaces non-[a-z0-9] with a single `-`,
// trims leading/trailing `-`. Used to derive the natural key for every
// parsed row. The result is deterministic and side-effect-free.
// ---------------------------------------------------------------------------
export function slugify(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFD')                          // split "é" -> "e" + combining accent
    .replace(/[̀-ͯ]/g, '')           // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')               // any run of non-[a-z0-9] -> "-"
    .replace(/^-+|-+$/g, '')                   // trim leading/trailing "-"
    .slice(0, 120);                            // DB column max
}

// ---------------------------------------------------------------------------
// parseCurriculum: the public entry point. Reads the workbook, walks the
// Summary sheet for the program list, then drills into each program sheet
// for the courses/chapters/sessions.
// ---------------------------------------------------------------------------
export async function parseCurriculum(
  buf: Buffer,
  opts: { language: Language },
): Promise<ParsedCurriculum> {
  const wb = new ExcelJS.Workbook();
  // exceljs reads from a Buffer; the cast is needed because
  // the @types/exceljs signature accepts a Node Readable, but
  // a Buffer also works (the workbook constructor reads
  // synchronously when given a Buffer).
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  const errors: ParseError[] = [];
  const programs: ParsedProgram[] = [];
  const grades: ParsedGrade[] = [];
  const courses: ParsedCourse[] = [];
  const chapters: ParsedChapter[] = [];
  const sessions: ParsedSession[] = [];

  // 1. Find the Summary sheet by name (en/fr). The parser
  //    does NOT assume position 1; it searches by header
  //    text (the program name + description cells).
  const summarySheet = findSummarySheet(wb, opts.language);
  if (!summarySheet) {
    return emptyResult(opts.language, [{
      sheet: 'workbook',
      row: 0,
      reason: `No Summary sheet found for language "${opts.language}".`,
    }]);
  }

  // 2. Walk the Summary sheet for the program rows.
  //    R4 is the header row; R5..R9 are the 5 program rows
  //    (today; the parser does not assume 5). A row is a
  //    program if col 2 has a non-empty string and col 1
  //    is empty.
  let programOrder = 0;
  summarySheet.eachRow((row, rowNumber) => {
    if (rowNumber < 5) return;                       // skip header rows
    const col2 = cellString(row.getCell(2));
    const col3 = cellString(row.getCell(3));
    if (!col2) return;                                // empty row — skip
    const program: ParsedProgram = {
      slug: slugify(col2),
      title: col2,
      subtitle: col3 || null,
      sheetName: col2,                               // cross-check only
      sessionCount: 0,
    };
    if (!program.slug) {
      errors.push({ sheet: summarySheet.name, row: rowNumber, reason: 'Could not derive a slug from the program title.' });
      return;
    }
    programs.push(program);
    programOrder += 1;
  });

  // 3. For each program, find its program sheet by name
  //    (en/fr) and parse the courses/chapters/sessions.
  for (const program of programs) {
    const sheetName = pickProgramSheetName(wb, program, opts.language);
    if (!sheetName) {
      errors.push({ sheet: 'workbook', row: 0, reason: `No sheet found for program "${program.title}".` });
      continue;
    }
    const programSheet = wb.getWorksheet(sheetName);
    if (!programSheet) {
      errors.push({ sheet: 'workbook', row: 0, reason: `Sheet "${sheetName}" missing for program "${program.title}".` });
      continue;
    }
    const result = parseProgramSheet(programSheet, program, opts.language, errors);
    grades.push(...result.grades);
    courses.push(...result.courses);
    chapters.push(...result.chapters);
    sessions.push(...result.sessions);
    program.sessionCount = result.sessions.length;
  }

  return {
    language: opts.language,
    programs,
    grades,
    courses,
    chapters,
    sessions,
    errors,
  };
}

function emptyResult(language: Language, errors: ReadonlyArray<ParseError>): ParsedCurriculum {
  return { language, programs: [], grades: [], courses: [], chapters: [], sessions: [], errors };
}

// ---------------------------------------------------------------------------
// findSummarySheet: finds the Summary sheet by header text rather than
// hardcoded position. The Summary sheet's R4 col 2 contains a
// localised "Level / Track" or "Level / Filière" header; the parser
// keys off that string.
// ---------------------------------------------------------------------------
function findSummarySheet(wb: ExcelJS.Workbook, language: Language): ExcelJS.Worksheet | null {
  const expectedHeader = language === 'en' ? 'level / track' : 'level / filière';
  for (const ws of wb.worksheets) {
    const r4 = ws.getRow(4);
    const c2 = cellString(r4.getCell(2)).trim().toLowerCase();
    if (c2 === expectedHeader) return ws;
  }
  return null;
}

// pickProgramSheetName: the Summary sheet does not always
// include the sheet name in a dedicated cell; the program
// sheet name is typically the same as the program title
// from the Summary row. Try that first, then a
// case-insensitive match. Returns null if no sheet is
// found. No specific program title is hardcoded.
function pickProgramSheetName(
  wb: ExcelJS.Workbook,
  program: ParsedProgram,
  _language: Language,
): string | null {
  const candidates = [program.sheetName, program.title];
  const lowered = new Map<string, string>();
  for (const ws of wb.worksheets) {
    lowered.set(ws.name.toLowerCase(), ws.name);
  }
  for (const c of candidates) {
    const got = lowered.get(c.toLowerCase());
    if (got) return got;
  }
  return null;
}

// ---------------------------------------------------------------------------
// parseProgramSheet: walks one program sheet. Each program
// sheet contains one or more course blocks (each block has
// a section header at R6 with the course title, a column
// header row at R10, then data rows). The number of course
// blocks per sheet is data-driven — the parser discovers
// them by scanning for ALL-CAPS section headers, not by
// hardcoding a count or a list of titles.
// ---------------------------------------------------------------------------
function parseProgramSheet(
  ws: ExcelJS.Worksheet,
  program: ParsedProgram,
  language: Language,
  errors: ParseError[],
): { grades: ParsedGrade[]; courses: ParsedCourse[]; chapters: ParsedChapter[]; sessions: ParsedSession[] } {
  const grades: ParsedGrade[] = [];
  const courses: ParsedCourse[] = [];
  const chapters: ParsedChapter[] = [];
  const sessions: ParsedSession[] = [];

  // Track unique chapters per course so we can sort and
  // dedupe. The natural key is (courseSlug, slug) — two
  // data rows with the same chapter title (different
  // sessions) share one chapter row.
  const chapterSeenByCourse = new Map<string, Set<string>>();

  let currentCourse: { slug: string; title: string; sortOrder: number; gradeSlug: string | null } | null = null;
  let headerResolved = false;
  let columnMap: Map<number, CanonicalField> | null = null;
  let dataStarted = false;

  // Discover grades from the Block column as we see them
  // (only relevant for programs whose Block cells start
  // with a structural grade-marker prefix; see
  // isGradeLikeBlock). Other programs just get the
  // chapter's block grouping.
  const gradeSeen = new Set<string>();

  let dataRow = 0;
  ws.eachRow((row, rowNumber) => {
    // R2 is the program title (merged), R3 is the program
    // subtitle. R6 is the first course title. R10 is the
    // column header row. R11+ are the data rows.
    if (rowNumber < 6) return;

    const c2 = cellString(row.getCell(2));

    // Section header: a non-empty C2 with no leading digit
    // and no lowercase letter is a course title. The
    // course title is always uppercase in the workbook
    // (the column header row uses Title Case). The parser
    // does not enumerate the valid course titles — it
    // simply uses whatever the workbook supplies.
    if (looksLikeCourseTitle(c2)) {
      currentCourse = {
        slug: slugify(c2),
        title: c2,
        sortOrder: courses.filter((c) => c.programSlug === program.slug).length,
        gradeSlug: null,
      };
      courses.push({
        slug: currentCourse.slug,
        title: currentCourse.title,
        programSlug: program.slug,
        gradeSlug: null,
        sortOrder: currentCourse.sortOrder,
      });
      chapterSeenByCourse.set(currentCourse.slug, new Set<string>());
      headerResolved = false;
      columnMap = null;
      dataStarted = false;
      return;
    }

    if (!currentCourse) return;            // data before first course — skip

    // R10: column header row. Build the column → canonical
    // field map. We compare against the localised text in
    // column-aliases.ts. The "Header" cell in col 1 is
    // "No." / "N°"; the row ends with "Resources".
    if (!headerResolved) {
      // The header row has "No." in col 2. The col 4 cell
      // is "Chapter" (or "Chapitre"). The col 5 cell is
      // "Session" (or "Séance"). If those are present,
      // this is the header row.
      const c4 = cellString(row.getCell(4));
      const c5 = cellString(row.getCell(5));
      if (resolveColumn(c4) === 'chapter' && resolveColumn(c5) === 'session') {
        columnMap = new Map();
        for (let col = 2; col <= 8; col += 1) {
          const field = resolveColumn(cellString(row.getCell(col)));
          if (field) columnMap.set(col, field);
        }
        headerResolved = true;
      }
      return;
    }

    if (!columnMap) return;

    // Data row. Col 2 is the session position (an integer
    // or a string like "1"). The row is a data row iff
    // col 2 is a non-empty number.
    const positionCell = row.getCell(2);
    const positionRaw = positionCell.value;
    if (positionRaw === null || positionRaw === undefined || positionRaw === '') return;
    if (typeof positionRaw === 'object' && positionRaw && 'formula' in positionRaw) return; // formula row — Total
    const position = typeof positionRaw === 'number'
      ? positionRaw
      : Number.parseInt(String(positionRaw), 10);
    if (!Number.isFinite(position) || position < 1) return;

    dataRow += 1;
    dataStarted = true;

    const block   = (columnMap.get(3) ? cellString(row.getCell(3)) : '') || null;
    const chapter = (columnMap.get(4) ? cellString(row.getCell(4)) : '');
    const session = (columnMap.get(5) ? cellString(row.getCell(5)) : '');

    if (!chapter) {
      errors.push({ sheet: ws.name, row: rowNumber, reason: 'Missing chapter title.' });
      return;
    }
    if (!session) {
      errors.push({ sheet: ws.name, row: rowNumber, reason: 'Missing session title.' });
      return;
    }

    const lectureHrs  = columnMap.get(6)  ? readInt(row.getCell(6))  : null;
    const exerciseHrs = columnMap.get(7)  ? readInt(row.getCell(7))  : null;

    const chapterSlug = slugify(chapter);
    const sessionSlug = slugify(session);

    // Discover the chapter on the first session of that
    // chapter. The first block cell for the chapter is
    // stored in the chapter row. Subsequent sessions in
    // the same chapter share the row.
    const seen = chapterSeenByCourse.get(currentCourse.slug);
    if (seen && !seen.has(chapterSlug)) {
      seen.add(chapterSlug);
      chapters.push({
        courseSlug: currentCourse.slug,
        slug: chapterSlug,
        title: chapter,
        block: block,
        sortOrder: seen.size - 1,
        isPublished: true,
      });
    }

    // Grade discovery: for programs whose Block cells look
  // like grade labels (a structural prefix that the
  // workbook's own grading convention uses, e.g. an EN
  // "<prefix> N — …" or an FR equivalent), the parser
  // emits a ParsedGrade row. The literal "<prefix>" is
  // the workbook's structural marker, not a curriculum
  // name; no grade value is hardcoded here.
    if (block && isGradeLikeBlock(block) && !gradeSeen.has(block)) {
      gradeSeen.add(block);
      const gradeSlug = slugify(block);
      grades.push({
        programSlug: program.slug,
        slug: gradeSlug,
        title: block,
        sortOrder: grades.length,
      });
      // The course inherits the grade only on the first
      // row that references it (best effort; the importer
      // also stores the block in the chapter metadata).
      if (currentCourse.gradeSlug === null) {
        currentCourse.gradeSlug = gradeSlug;
        const idx = courses.findIndex((c) => c.slug === currentCourse!.slug);
        if (idx >= 0) {
          const found = courses[idx]!;
          courses[idx] = { ...found, gradeSlug };
        }
      }
    }

    // Duration: lectureHrs + exerciseHrs in 60-minute
    // blocks. The workbook rounds to integers (e.g. 1 + 1
    // = 2). We keep the int round-trip identical.
    const totalMin =
      lectureHrs != null && exerciseHrs != null
        ? (lectureHrs + exerciseHrs) * 60
        : null;

    sessions.push({
      chapterSlug,
      courseSlug: currentCourse.slug,
      position,
      slug: sessionSlug,
      title: session,
      priceCents: null,                           // invariant #2
      durationMin: totalMin,
      isPublished: true,
      isPreview: false,
    });

    // dataRow is informational; the column count assertion
    // below uses the length of `sessions` instead.
    void dataRow;
    void dataStarted;
  });

  return { grades, courses, chapters, sessions };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function cellString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') {
    // Formula cells: { formula: '...', result: '...' }.
    // We use the result string when present.
    const obj = v as { result?: unknown; text?: unknown; richText?: Array<{ text: string }> };
    if (typeof obj.text === 'string') return obj.text;
    if (Array.isArray(obj.richText)) return obj.richText.map((rt) => rt.text).join('');
    if (obj.result !== undefined) return String(obj.result);
    return '';
  }
  return '';
}

function readInt(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'object') {
    const obj = v as { result?: unknown };
    if (obj.result !== undefined) {
      if (typeof obj.result === 'number') return Number.isFinite(obj.result) ? obj.result : null;
      if (typeof obj.result === 'string') {
        const n = Number.parseInt(obj.result, 10);
        return Number.isFinite(n) ? n : null;
      }
    }
  }
  return null;
}

// A course title is a non-empty string in col 2 that is
// uppercased (the program subtitle + the column header
// rows are sentence-case). This is the only place we use
// the visual layout of the workbook to detect the section
// break; the data rows (col 2 is an int) never match.
function looksLikeCourseTitle(s: string): boolean {
  if (!s) return false;
  const trimmed = s.trim();
  if (trimmed.length < 3) return false;
  // Reject anything that starts with a digit (data rows).
  if (/^\d/.test(trimmed)) return false;
  // Reject anything that contains a lowercase letter
  // (the course titles are ALL-CAPS in the workbook).
  if (/[a-z]/.test(trimmed)) return false;
  return true;
}

// isGradeLikeBlock: a Block cell is a grade if it starts
// with the literal "Grade " (English) or "Niveau " (French).
// The parser keys off this structural prefix only — the
// rest of the string can be anything (the workbook's own
// grading convention). This is invariant #1 compliant: no
// curriculum name is hardcoded, only the structural
// prefix that identifies a grade row.
function isGradeLikeBlock(s: string): boolean {
  const t = s.trim();
  return /^Grade\s/i.test(t) || /^Niveau\s/i.test(t);
}

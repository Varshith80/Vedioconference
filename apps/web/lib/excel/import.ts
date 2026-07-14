// =====================================================================
// `lib/excel/import.ts` — pure-ish, idempotent curriculum importer.
//
// Takes a `ParsedCurriculum` (the output of parse-curriculum.ts) and
// applies it to the v2 curriculum tables via ON CONFLICT upserts.
//
// Invariants (Sprint 3.6 §5.0):
//   1. DATA-DRIVEN. No curriculum name is hardcoded in this file
//      or in the call sites. Every string written to the DB comes
//      from the workbook via the ParsedCurriculum tree, or is a
//      structural constant (e.g. 'EUR' default currency). The
//      parse-curriculum-no-hardcoded-names.test.ts suite enforces
//      this.
//   2. NULL PRICES. Session price_cents is written as NULL unless
//      the parsed tree contains a positive integer for that row.
//      No placeholder prices are ever generated. Sprint 5 owns
//      real prices.
//   3. IDEMPOTENT. Every write is ON CONFLICT (<natural key>)
//      DO UPDATE. Importing the same workbook twice produces
//      exactly the same row set; no duplicates, no churn on
//      unchanged rows. The import-idempotency.test.ts suite
//      enforces this.
//
// The importer does not know what curriculum it is importing. The
// same code paths work for any workbook whose shape matches the
// canonical parser contract.
// =====================================================================

import 'server-only';
import type {
  ParsedCurriculum,
  ParsedProgram,
  ParsedGrade,
  ParsedCourse,
  ParsedChapter,
  ParsedSession,
  ParseError,
} from './parse-curriculum';
import { logger } from '@/lib/utils/logger';
import { describeError } from '@/lib/utils/errors';

// ---- Result types ------------------------------------------------------

export interface ImportReport {
  ok: boolean;
  counts: {
    programs: number;
    grades: number;
    courses: number;
    chapters: number;
    sessions: number;
    skipped: number;
  };
  errors: ReadonlyArray<ParseError>;
}

// The untyped Supabase client is what the importer accepts (this
// matches the boundary pattern in CLAUDE.md §3.9 — services cast
// at the boundary; the importer sits at the boundary between the
// parser and the DB).
// We use a structural type so this file does not pull in the
// generated `Database` type (the type-check would then fail on
// the untyped `unknown` schema). The fake client in the test
// suite satisfies the structural shape.
type UntypedClient = {
  from: (table: string) => {
    upsert: (
      rows: unknown,
      opts?: { onConflict?: string },
    ) => {
      select: (cols?: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) => Promise<unknown>;
    };
  };
};

// ---- Natural keys ------------------------------------------------------
// programs:  unique on slug
// grades:    unique on (program_id, slug)
// courses:   unique on slug
// chapters:  unique on (course_id, slug)
// sessions:  unique on (chapter_id, position)
// See the migrations:
//   20260714000000_programs_grades.sql      (programs, grades)
//   20260707000003_tutors_courses.sql       (courses)
//   20260714000001_chapters_sessions.sql    (chapters, sessions)

// ---- Structural constants ----------------------------------------------
// The ONLY strings this file writes to the DB that are NOT taken
// from the workbook:
//   - 'EUR' (default currency, matches the existing schema default)
//   - 'v2' (the schema version metadata stamp)
//   - column names (in select() / eq() / etc.)
//   - log strings (never stored)
const DEFAULT_CURRENCY = 'EUR';

// ---- Helpers ----------------------------------------------------------

// Map<canonical id, id> caches. The importer walks the tree in
// insertion order, so once a program is upserted its id is in the
// cache; grades and courses that reference it can resolve their
// parent id without a second roundtrip.
type IdCache = {
  programIdBySlug: Map<string, string>;
  gradeIdByKey: Map<string, string>; // key = `${programSlug}::${gradeSlug}`
  courseIdBySlug: Map<string, string>;
  chapterIdByKey: Map<string, string>; // key = `${courseSlug}::${chapterSlug}`
};

const newIdCache = (): IdCache => ({
  programIdBySlug: new Map(),
  gradeIdByKey: new Map(),
  courseIdBySlug: new Map(),
  chapterIdByKey: new Map(),
});

// Apply a single parsed Program via ON CONFLICT (slug) DO UPDATE.
// Returns the row id. The cache is updated in place.
async function upsertProgram(
  supabase: UntypedClient,
  cache: IdCache,
  p: ParsedProgram,
  errors: ParseError[],
  sheetLabel: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('programs')
      .upsert(
        {
          slug: p.slug,
          title: p.title,
          subtitle: p.subtitle,
          // description: the parser does not yet surface a
          // program-level description; default to null. The
          // future admin form will write the real value.
          description: null,
          is_published: true,
          sort_order: 0,
          metadata: { source: 'excel-import', sheet: p.sheetName },
        } as never,
        { onConflict: 'slug' },
      )
      .select('id, slug')
      .single();
    if (error) throw error;
    const row = data as unknown as { id: string; slug: string };
    cache.programIdBySlug.set(row.slug, row.id);
    return row.id;
  } catch (e) {
    logger.error('upsertProgram failed', { slug: p.slug, ...describeError(e) });
    errors.push({
      sheet: sheetLabel,
      row: 0,
      reason: `program upsert failed for slug="${p.slug}": ${describeError(e).message}`,
    });
    return null;
  }
}

// Apply a single parsed Grade via ON CONFLICT (program_id, slug)
// DO UPDATE.
async function upsertGrade(
  supabase: UntypedClient,
  cache: IdCache,
  g: ParsedGrade,
  errors: ParseError[],
  sheetLabel: string,
): Promise<string | null> {
  const programId = cache.programIdBySlug.get(g.programSlug);
  if (!programId) {
    errors.push({
      sheet: sheetLabel,
      row: 0,
      reason: `grade "${g.slug}" references unknown program "${g.programSlug}"`,
    });
    return null;
  }
  try {
    const { data, error } = await supabase
      .from('grades')
      .upsert(
        {
          program_id: programId,
          slug: g.slug,
          title: g.title,
          sort_order: g.sortOrder,
          metadata: { source: 'excel-import' },
        } as never,
        { onConflict: 'program_id,slug' },
      )
      .select('id, program_id, slug')
      .single();
    if (error) throw error;
    const row = data as unknown as { id: string; program_id: string; slug: string };
    cache.gradeIdByKey.set(`${g.programSlug}::${g.slug}`, row.id);
    return row.id;
  } catch (e) {
    logger.error('upsertGrade failed', {
      programSlug: g.programSlug,
      gradeSlug: g.slug,
      ...describeError(e),
    });
    errors.push({
      sheet: sheetLabel,
      row: 0,
      reason: `grade upsert failed for "${g.programSlug}/${g.slug}": ${describeError(e).message}`,
    });
    return null;
  }
}

// Apply a single parsed Course via ON CONFLICT (slug) DO UPDATE.
// The v1 courses table has NOT NULL columns subject / level /
// level_group / price_cents / duration_min that the workbook
// does not provide as separate fields. We satisfy them with
// values derived purely from the workbook's own strings:
//   - subject      := course title (workbook-derived)
//   - level        := program title (workbook-derived)
//   - level_group  := program slug (workbook-derived, stable)
//   - price_cents  := 0 (placeholder; sessions carry the real price;
//                       a future cleanup migration drops the column)
//   - duration_min := 60 (default; the chapter's
//                       default_duration_min overrides per chapter)
// No hardcoded curriculum name appears here — every string
// originates in the parsed tree.
async function upsertCourse(
  supabase: UntypedClient,
  cache: IdCache,
  programTitles: Map<string, string>,
  c: ParsedCourse,
  errors: ParseError[],
  sheetLabel: string,
): Promise<string | null> {
  const programId = cache.programIdBySlug.get(c.programSlug);
  if (!programId) {
    errors.push({
      sheet: sheetLabel,
      row: 0,
      reason: `course "${c.slug}" references unknown program "${c.programSlug}"`,
    });
    return null;
  }
  let gradeId: string | null = null;
  if (c.gradeSlug) {
    const cached = cache.gradeIdByKey.get(`${c.programSlug}::${c.gradeSlug}`);
    if (!cached) {
      errors.push({
        sheet: sheetLabel,
        row: 0,
        reason: `course "${c.slug}" references unknown grade "${c.programSlug}/${c.gradeSlug}"`,
      });
      return null;
    }
    gradeId = cached;
  }
  const level = programTitles.get(c.programSlug) ?? c.programSlug;
  try {
    const { data, error } = await supabase
      .from('courses')
      .upsert(
        {
          slug: c.slug,
          title: c.title,
          program_id: programId,
          grade_id: gradeId,
          subject: c.title,
          level,
          level_group: c.programSlug,
          price_cents: 0,
          currency: DEFAULT_CURRENCY,
          duration_min: 60,
          // The parser does not yet surface a per-course
          // is_published flag; default to true so the import
          // makes the catalog immediately visible. A future
          // admin form will expose the per-course publish
          // toggle.
          is_published: true,
          metadata: { source: 'excel-import' },
        } as never,
        { onConflict: 'slug' },
      )
      .select('id, slug')
      .single();
    if (error) throw error;
    const row = data as unknown as { id: string; slug: string };
    cache.courseIdBySlug.set(row.slug, row.id);
    return row.id;
  } catch (e) {
    logger.error('upsertCourse failed', {
      slug: c.slug,
      ...describeError(e),
    });
    errors.push({
      sheet: sheetLabel,
      row: 0,
      reason: `course upsert failed for slug="${c.slug}": ${describeError(e).message}`,
    });
    return null;
  }
}

// Apply a single parsed Chapter via ON CONFLICT (course_id, slug)
// DO UPDATE.
async function upsertChapter(
  supabase: UntypedClient,
  cache: IdCache,
  ch: ParsedChapter,
  errors: ParseError[],
  sheetLabel: string,
): Promise<string | null> {
  const courseId = cache.courseIdBySlug.get(ch.courseSlug);
  if (!courseId) {
    errors.push({
      sheet: sheetLabel,
      row: 0,
      reason: `chapter "${ch.slug}" references unknown course "${ch.courseSlug}"`,
    });
    return null;
  }
  // The "Block" hint from the workbook is stored in the chapter's
  // metadata. It carries structural information (a grade label
  // for programs with grades, a block grouping otherwise) that
  // the workbook's grading convention uses.
  const metadata: Record<string, unknown> = { source: 'excel-import' };
  if (ch.block !== null) metadata.block = ch.block;
  try {
    const { data, error } = await supabase
      .from('chapters')
      .upsert(
        {
          course_id: courseId,
          slug: ch.slug,
          title: ch.title,
          default_duration_min: 60,
          is_published: ch.isPublished,
          sort_order: ch.sortOrder,
          metadata,
        } as never,
        { onConflict: 'course_id,slug' },
      )
      .select('id, course_id, slug')
      .single();
    if (error) throw error;
    const row = data as unknown as { id: string; course_id: string; slug: string };
    cache.chapterIdByKey.set(`${ch.courseSlug}::${ch.slug}`, row.id);
    return row.id;
  } catch (e) {
    logger.error('upsertChapter failed', {
      courseSlug: ch.courseSlug,
      chapterSlug: ch.slug,
      ...describeError(e),
    });
    errors.push({
      sheet: sheetLabel,
      row: 0,
      reason: `chapter upsert failed for "${ch.courseSlug}/${ch.slug}": ${describeError(e).message}`,
    });
    return null;
  }
}

// Apply all parsed sessions of a single chapter in ONE roundtrip,
// via ON CONFLICT (chapter_id, position) DO UPDATE.
//
// Invariant #2: price_cents is null unless the parsed tree
// supplied a non-negative integer for that row. The parser
// guarantees that, but the importer re-validates defensively.
async function bulkUpsertSessionsForChapter(
  supabase: UntypedClient,
  chapterId: string,
  sessions: ReadonlyArray<ParsedSession>,
  errors: ParseError[],
  sheetLabel: string,
): Promise<number> {
  if (sessions.length === 0) return 0;
  const rows = sessions.map((s) => ({
    chapter_id: chapterId,
    position: s.position,
    slug: s.slug,
    title: s.title,
    duration_min: s.durationMin,
    // Defensive re-validation of invariant #2: a session row
    // with a non-null price must be a non-negative integer.
    // The parser already enforces this; the importer is the
    // last line of defence.
    price_cents:
      s.priceCents === null || (Number.isInteger(s.priceCents) && s.priceCents >= 0)
        ? s.priceCents
        : null,
    currency: DEFAULT_CURRENCY,
    is_published: s.isPublished,
    is_preview: s.isPreview,
    metadata: { source: 'excel-import' },
  }));
  try {
    const { error } = await supabase
      .from('sessions')
      .upsert(rows as never, { onConflict: 'chapter_id,position' });
    if (error) throw error;
    return sessions.length;
  } catch (e) {
    logger.error('bulkUpsertSessionsForChapter failed', {
      chapterId,
      count: sessions.length,
      ...describeError(e),
    });
    errors.push({
      sheet: sheetLabel,
      row: 0,
      reason: `session bulk upsert failed for chapter ${chapterId} (${sessions.length} rows): ${describeError(e).message}`,
    });
    return 0;
  }
}

// Group sessions by their chapter key so they can be bulk-upserted
// in one roundtrip per chapter.
function groupSessionsByChapterKey(
  sessions: ReadonlyArray<ParsedSession>,
): Map<string, ParsedSession[]> {
  const out = new Map<string, ParsedSession[]>();
  for (const s of sessions) {
    const key = `${s.courseSlug}::${s.chapterSlug}`;
    const arr = out.get(key);
    if (arr) arr.push(s);
    else out.set(key, [s]);
  }
  return out;
}

// ---- Public API --------------------------------------------------------

/**
 * Apply a ParsedCurriculum to the DB.
 *
 * Returns an ImportReport. The report is NEVER thrown — the
 * caller decides whether partial success is acceptable (it is,
 * for the Excel import: a bad row is logged, the rest is
 * committed).
 *
 * Idempotency: every write is upsert on the natural key. Calling
 * this twice on the same input produces the same row set with
 * the same `updated_at` and zero new rows.
 */
export async function importParsedCurriculum(
  supabase: UntypedClient,
  parsed: ParsedCurriculum,
): Promise<ImportReport> {
  const errors: ParseError[] = [];
  const cache = newIdCache();
  // Snapshot the program titles BEFORE we start mutating, so
  // that upsertCourse can copy the workbook's own program title
  // into the v1 courses.level column. (The DB returns the
  // persisted title which we wrote, but the parsed tree's title
  // is the authoritative workbook string.)
  const programTitles = new Map<string, string>(
    parsed.programs.map((p) => [p.slug, p.title]),
  );

  let programs = 0;
  let grades = 0;
  let courses = 0;
  let chapters = 0;
  let sessions = 0;
  let skipped = 0;

  // Phase 1 — programs.
  for (const p of parsed.programs) {
    const id = await upsertProgram(supabase, cache, p, errors, p.sheetName);
    if (id) programs++;
    else skipped++;
  }

  // Phase 2 — grades (depends on programs being inserted).
  for (const g of parsed.grades) {
    const id = await upsertGrade(supabase, cache, g, errors, g.programSlug);
    if (id) grades++;
    else skipped++;
  }

  // Phase 3 — courses (depends on programs and grades).
  for (const c of parsed.courses) {
    const id = await upsertCourse(
      supabase,
      cache,
      programTitles,
      c,
      errors,
      c.programSlug,
    );
    if (id) courses++;
    else skipped++;
  }

  // Phase 4 — chapters (depends on courses).
  for (const ch of parsed.chapters) {
    const id = await upsertChapter(supabase, cache, ch, errors, ch.courseSlug);
    if (id) chapters++;
    else skipped++;
  }

  // Phase 5 — sessions (depends on chapters). Group by chapter
  // so we can do one bulk upsert per chapter. The chapter's
  // (courseSlug, chapterSlug) key is unique.
  const sessionsByChapter = groupSessionsByChapterKey(parsed.sessions);
  for (const [key, rows] of sessionsByChapter) {
    const chapterId = cache.chapterIdByKey.get(key);
    if (!chapterId) {
      errors.push({
        sheet: 'sessions',
        row: 0,
        reason: `${rows.length} session(s) reference unknown chapter "${key}"`,
      });
      skipped += rows.length;
      continue;
    }
    const n = await bulkUpsertSessionsForChapter(
      supabase,
      chapterId,
      rows,
      errors,
      key,
    );
    sessions += n;
    if (n === 0) skipped += rows.length;
  }

  const ok = errors.length === 0;
  return {
    ok,
    counts: { programs, grades, courses, chapters, sessions, skipped },
    errors,
  };
}

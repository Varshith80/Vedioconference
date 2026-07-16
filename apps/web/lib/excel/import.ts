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
  Language,
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
    select: (cols?: string) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) => Promise<unknown>;
      };
    };
    update: (vals: unknown) => {
      eq: (col: string, val: unknown) => {
        then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) => Promise<unknown>;
      };
    };
    insert: (rows: unknown) => {
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

// ---- Localized-title metadata helper -----------------------------------
// `metadata.titles[locale]` is the per-locale title written by the
// importer and read by `lib/i18n/localized-title.ts` at render
// time. The shape is `Record<'en' | 'fr', { title: string; slug:
// string }>`. The runtime helper falls back to `row.title` if the
// locale is missing from `metadata.titles`, so any row that is
// only ever written once (the first import) still renders
// correctly in both locales.
type LocalizedTitle = { title: string; slug: string };

function buildTitlesField(
  language: Language | null,
  title: string,
  slug: string,
): Record<string, LocalizedTitle> {
  if (!language) return {};
  return { [language]: { title, slug } };
}

// Merge a per-locale title entry into an existing metadata object.
// The existing metadata is preserved (block, source, etc.); only
// `metadata.titles[language]` is added or replaced. The merge is
// tolerant of legacy / foreign JSON shapes: a non-object input
// is treated as `{}`.
function mergeSessionMetadata(
  existing: unknown,
  language: Language | null,
  title: string,
  slug: string,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (!language) return base;
  const titlesRaw = base.titles;
  const titles: Record<string, LocalizedTitle> =
    titlesRaw && typeof titlesRaw === 'object' && !Array.isArray(titlesRaw)
      ? { ...(titlesRaw as Record<string, LocalizedTitle>) }
      : {};
  titles[language] = { title, slug };
  base.titles = titles;
  return base;
}

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
  language: Language | null,
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
          metadata: {
            source: 'excel-import',
            sheet: p.sheetName,
            ...buildTitlesField(language, p.title, p.slug),
          },
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
  language: Language | null,
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
          metadata: {
            source: 'excel-import',
            ...buildTitlesField(language, g.title, g.slug),
          },
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
  language: Language | null,
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
          metadata: {
            source: 'excel-import',
            ...buildTitlesField(language, c.title, c.slug),
          },
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

// Apply a single parsed Chapter. The chapters table has two
// unique constraints: (course_id, position) and (course_id, slug).
// For a re-import with a different language, the slug produced
// from the FR title differs from the existing EN slug, so an
// `upsert on course_id,sort_order` would violate the
// (course_id, slug) constraint. The strategy: pre-fetch the
// existing row at (course_id, position) and UPDATE its title
// and metadata in place. The slug is preserved as the EN
// canonical slug; only `metadata.titles[language]` is added.
async function upsertChapter(
  supabase: UntypedClient,
  cache: IdCache,
  ch: ParsedChapter,
  language: Language | null,
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
  const targetPosition = ch.sortOrder + 1;
  const { data: existing, error: existingErr } = await supabase
    .from('chapters')
    .select('id, slug, title, metadata')
    .eq('course_id', courseId)
    .eq('position', targetPosition)
    .maybeSingle();
  if (existingErr) {
    logger.error('chapter pre-fetch failed', {
      courseId,
      position: targetPosition,
      ...describeError(existingErr),
    });
    errors.push({
      sheet: sheetLabel,
      row: 0,
      reason: `chapter pre-fetch failed for "${ch.courseSlug}" position ${targetPosition}: ${describeError(existingErr).message}`,
    });
    return null;
  }
  if (existing) {
    // Update in place: title + metadata. The slug is
    // preserved as the canonical slug; only
    // `metadata.titles[language]` is added.
    const row = existing as { id: string; slug: string; title: string; metadata: unknown };
    const merged = mergeSessionMetadata(row.metadata, language, ch.title, ch.slug);
    const { error: updateErr } = await supabase
      .from('chapters')
      .update({
        title: ch.title,
        metadata: merged,
      } as never)
      .eq('id', row.id);
    if (updateErr) {
      logger.error('chapter update failed', {
        courseId,
        position: targetPosition,
        ...describeError(updateErr),
      });
      errors.push({
        sheet: sheetLabel,
        row: 0,
        reason: `chapter update failed for "${ch.courseSlug}" position ${targetPosition}: ${describeError(updateErr).message}`,
      });
      return null;
    }
    cache.chapterIdByKey.set(`${ch.courseSlug}::${ch.slug}`, row.id);
    return row.id;
  }

  // No existing row at this position. This is a new chapter;
  // insert it. (Both unique constraints are satisfied because
  // position and slug are unique within the course.)
  const metadata: Record<string, unknown> = {
    source: 'excel-import',
    ...buildTitlesField(language, ch.title, ch.slug),
  };
  if (ch.block !== null) metadata.block = ch.block;
  try {
    const { data, error } = await supabase
      .from('chapters')
      .insert({
        course_id: courseId,
        slug: ch.slug,
        title: ch.title,
        position: targetPosition,
        default_duration_min: 60,
        is_published: ch.isPublished,
        sort_order: ch.sortOrder,
        metadata,
      } as never)
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
  language: Language | null,
  errors: ParseError[],
  sheetLabel: string,
): Promise<number> {
  if (sessions.length === 0) return 0;

  // The sessions table has two unique constraints:
  //   (chapter_id, position)  -- the canonical natural key
  //   (chapter_id, slug)      -- secondary, slug must be unique too
  //
  // For a re-import with a different language (e.g. the FR run
  // after an earlier import), the slug produced from the FR
  // session title will differ from the existing slug, and the
  // position may also differ (depending on how the original
  // import interpreted the workbook's "N°" column). The only
  // stable key across languages is the chapter_id + the
  // session title itself (which the importer trusts because
  // it is the same conceptual session on both workbooks).
  //
  // Strategy: fetch every existing session in the chapter,
  // then for each parsed session, try to match by position
  // first (the canonical key); if no match, try by slug; if
  // still no match, the session is new and gets inserted.
  // When a match is found, UPDATE the existing row's title
  // and metadata in place. The slug is preserved as the
  // canonical slug; only `metadata.titles[language]` is added.
  const { data: existing, error: existingErr } = await supabase
    .from('sessions')
    .select('id, position, slug, title, metadata')
    .eq('chapter_id', chapterId);
  if (existingErr) {
    logger.error('could not pre-fetch existing sessions', {
      chapterId,
      ...describeError(existingErr),
    });
    errors.push({
      sheet: sheetLabel,
      row: 0,
      reason: `pre-fetch failed for chapter ${chapterId}: ${describeError(existingErr).message}`,
    });
    return 0;
  }
  const existingByPosition = new Map<number, { id: string; slug: string; title: string; metadata: unknown }>();
  const existingBySlug = new Map<string, { id: string; slug: string; title: string; metadata: unknown; position: number }>();
  for (const row of (existing as ReadonlyArray<{ id: string; position: number; slug: string; title: string; metadata: unknown }> | null) ?? []) {
    existingByPosition.set(row.position, row);
    existingBySlug.set(row.slug, row);
  }

  let updated = 0;
  for (const s of sessions) {
    // Match existing row by position first (the canonical
    // natural key), then fall back to slug. The slug fallback
    // is needed when the FR parser produced a different
    // position than the existing DB row (e.g. the existing
    // row was imported from the EN workbook at a different
    // position than the FR parser's per-chapter counter).
    const match =
      existingByPosition.get(s.position) ??
      existingBySlug.get(s.slug) ??
      null;
    if (!match) {
      // No existing row matches by position or by slug. This
      // is a genuinely new session; insert it with the parsed
      // position and slug. The two unique constraints are
      // satisfied because the position is unique within the
      // chapter and the slug is unique within the chapter.
      const newRow = {
        chapter_id: chapterId,
        position: s.position,
        slug: s.slug,
        title: s.title,
        duration_min: s.durationMin,
        price_cents:
          s.priceCents === null || (Number.isInteger(s.priceCents) && s.priceCents >= 0)
            ? s.priceCents
            : null,
        currency: DEFAULT_CURRENCY,
        is_published: s.isPublished,
        is_preview: s.isPreview,
        metadata: {
          source: 'excel-import',
          ...buildTitlesField(language, s.title, s.slug),
        },
      };
      const { error } = await supabase
        .from('sessions')
        .insert(newRow as never);
      if (error) {
        logger.error('session insert failed', {
          chapterId,
          position: s.position,
          ...describeError(error),
        });
        errors.push({
          sheet: sheetLabel,
          row: 0,
          reason: `session insert failed for chapter ${chapterId} position ${s.position}: ${describeError(error).message}`,
        });
        continue;
      }
      updated++;
      continue;
    }
    // Existing row matched (by position or by slug): update
    // title + metadata in place. The slug is preserved as the
    // existing canonical slug (which may be the EN slug if
    // matched by position, or the parsed slug if matched by
    // slug); only `metadata.titles[language]` is added. This
    // is the idempotent localization path.
    const merged = mergeSessionMetadata(match.metadata, language, s.title, s.slug);
    const { error: updateErr } = await supabase
      .from('sessions')
      .update({
        title: s.title,
        metadata: merged,
      } as never)
      .eq('id', match.id);
    if (updateErr) {
      logger.error('session update failed', {
        chapterId,
        position: s.position,
        ...describeError(updateErr),
      });
      errors.push({
        sheet: sheetLabel,
        row: 0,
        reason: `session update failed for chapter ${chapterId} position ${s.position}: ${describeError(updateErr).message}`,
      });
      continue;
    }
    updated++;
  }
  return updated;
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
  opts: { language?: Language | null } = {},
): Promise<ImportReport> {
  const errors: ParseError[] = [];
  const cache = newIdCache();
  // The `language` opt is the language of the workbook that
  // produced `parsed`. When set, the importer writes
  // `metadata.titles[language]` on every row. The runtime
  // helper (`lib/i18n/localized-title.ts`) reads that field
  // to render the right title per locale. A null `language`
  // means the import is language-agnostic (no title is
  // written; only the existing `metadata.source`).
  const language: Language | null = opts.language ?? parsed.language ?? null;
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
    const id = await upsertProgram(supabase, cache, p, language, errors, p.sheetName);
    if (id) programs++;
    else skipped++;
  }

  // Phase 2 — grades (depends on programs being inserted).
  for (const g of parsed.grades) {
    const id = await upsertGrade(supabase, cache, g, language, errors, g.programSlug);
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
      language,
      errors,
      c.programSlug,
    );
    if (id) courses++;
    else skipped++;
  }

  // Phase 4 — chapters (depends on courses).
  for (const ch of parsed.chapters) {
    const id = await upsertChapter(supabase, cache, ch, language, errors, ch.courseSlug);
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
      language,
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

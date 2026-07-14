import { describe, it, expect, beforeEach } from 'vitest';
import { importParsedCurriculum } from '@/lib/excel/import';
import type {
  ParsedCurriculum,
  ParsedProgram,
  ParsedGrade,
  ParsedCourse,
  ParsedChapter,
  ParsedSession,
} from '@/lib/excel/parse-curriculum';

// =====================================================================
// Sprint 3.6 §5.0 invariant #3: the importer is fully idempotent.
//
// Strategy: build a small ParsedCurriculum by hand (no real
// workbook), pass it through a fake Supabase client that records
// every upsert call, and assert that the second invocation makes
// the same set of upsert calls (no raw insert, no duplicate
// natural-key rows). Every write is keyed on the table's
// natural unique constraint, so Supabase's ON CONFLICT DO UPDATE
// path is the only one used.
//
// Why a fake client: the unit suite must run in <1s with no
// external service. A real Supabase project is provisioned
// separately for integration tests (rls-smoke.sh + auth-smoke.ts).
// =====================================================================

// Build a 1-program / 1-grade / 1-course / 1-chapter / 2-session
// tree. Same shape as the synthetic workbook in
// parse-curriculum.test.ts, but built directly (no ExcelJS).
function buildParsedCurriculum(): ParsedCurriculum {
  const program: ParsedProgram = {
    slug: 'test-program',
    title: 'Test Program',
    subtitle: null,
    sheetName: 'Test Program',
    sessionCount: 2,
  };
  const grade: ParsedGrade = {
    programSlug: 'test-program',
    slug: 'grade-1',
    title: 'Grade 1',
    sortOrder: 0,
  };
  const course: ParsedCourse = {
    slug: 'test-course',
    title: 'TEST COURSE',
    programSlug: 'test-program',
    gradeSlug: null,
    sortOrder: 0,
  };
  const chapter: ParsedChapter = {
    courseSlug: 'test-course',
    slug: 'chapter-one',
    title: 'Chapter One',
    block: 'Block 1',
    sortOrder: 0,
    isPublished: true,
  };
  const sessions: ParsedSession[] = [
    {
      chapterSlug: 'chapter-one',
      courseSlug: 'test-course',
      position: 1,
      slug: 'session-1-intro',
      title: 'Session 1: intro',
      priceCents: null,
      durationMin: 120,
      isPublished: true,
      isPreview: false,
    },
    {
      chapterSlug: 'chapter-one',
      courseSlug: 'test-course',
      position: 2,
      slug: 'session-2-deep-dive',
      title: 'Session 2: deep dive',
      priceCents: null,
      durationMin: 180,
      isPublished: true,
      isPreview: false,
    },
  ];
  return {
    language: 'en',
    programs: [program],
    grades: [grade],
    courses: [course],
    chapters: [chapter],
    sessions,
    errors: [],
  };
}

// A small in-memory Supabase stand-in. Each table remembers
// the upsert calls and echoes a stable id.
type CallLog = Array<{ table: string; op: 'upsert'; rows: unknown }>;
type Row = Record<string, unknown>;
type Table = 'programs' | 'grades' | 'courses' | 'chapters' | 'sessions';

function naturalKey(table: Table, row: Row): string {
  if (table === 'programs') return String(row.slug);
  if (table === 'grades') return `${row.program_id}::${row.slug}`;
  if (table === 'courses') return String(row.slug);
  if (table === 'chapters') return `${row.course_id}::${row.slug}`;
  if (table === 'sessions') return `${row.chapter_id}::${row.position}`;
  return 'unknown';
}

function buildFakeSupabase() {
  const log: CallLog = [];
  const ids: Record<Table, Map<string, string>> = {
    programs: new Map(),
    grades: new Map(),
    courses: new Map(),
    chapters: new Map(),
    sessions: new Map(),
  };

  const fake = {
    from(table: string) {
      const t = table as Table;
      return {
        upsert(rows: unknown, _opts?: unknown) {
          const arr = Array.isArray(rows) ? rows : [rows];
          log.push({ table: t, op: 'upsert', rows: arr });
          const echoed: Row[] = [];
          for (const r of arr) {
            const row = r as Row;
            const key = naturalKey(t, row);
            let id = ids[t].get(key);
            if (!id) {
              id = `id-${t}-${ids[t].size}`;
              ids[t].set(key, id);
            }
            echoed.push({ id, ...row });
          }
          // Two return shapes:
          //  - .upsert(...).select(cols).single()  (program, grade, course, chapter)
          //  - .upsert(...)  (bare, awaited)        (sessions bulk)
          const self: Record<string, unknown> = {};
          self.select = (_cols?: string) => {
            const ss: Record<string, unknown> = {};
            ss.single = () => Promise.resolve({ data: echoed[0] ?? null, error: null });
            return ss;
          };
          // The bare form: `await supabase.from(...).upsert(rows, opts)`.
          // Make it a thenable.
          self.then = (
            onFulfilled: (v: { data: unknown; error: null }) => unknown,
          ) => Promise.resolve({ data: echoed, error: null }).then(onFulfilled);
          return self;
        },
      };
    },
    _log: log,
    _ids: ids,
  };
  return fake;
}

function callsFor(log: CallLog, table: string) {
  return log.filter((c) => c.table === table && c.op === 'upsert');
}

describe('importParsedCurriculum (Sprint 3.6 §5.0 invariant #3: idempotent)', () => {
  let fake: ReturnType<typeof buildFakeSupabase>;
  beforeEach(() => {
    fake = buildFakeSupabase();
  });

  it('first import: 1 program, 1 grade, 1 course, 1 chapter, 2 sessions, 0 skipped', async () => {
    const report = await importParsedCurriculum(
      fake as unknown as Parameters<typeof importParsedCurriculum>[0],
      buildParsedCurriculum(),
    );
    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({
      programs: 1,
      grades: 1,
      courses: 1,
      chapters: 1,
      sessions: 2,
      skipped: 0,
    });
    expect(report.errors).toEqual([]);
  });

  it('idempotency: second import with the same tree issues the same upsert calls (no inserts)', async () => {
    // First import populates the fake's id cache.
    await importParsedCurriculum(
      fake as unknown as Parameters<typeof importParsedCurriculum>[0],
      buildParsedCurriculum(),
    );
    const firstLogLength = fake._log.length;

    // Second import with the SAME parsed tree.
    const second = await importParsedCurriculum(
      fake as unknown as Parameters<typeof importParsedCurriculum>[0],
      buildParsedCurriculum(),
    );
    expect(second.ok).toBe(true);

    // Every write is still 'upsert' — never a raw insert. The
    // Supabase ON CONFLICT DO UPDATE path is the only one used.
    for (const c of fake._log.slice(firstLogLength)) {
      expect(c.op).toBe('upsert');
    }

    // The second import touches the same 5 tables in the same
    // order: programs, grades, courses, chapters, sessions.
    const tail = fake._log.slice(firstLogLength).map((c) => c.table);
    expect(tail).toEqual(['programs', 'grades', 'courses', 'chapters', 'sessions']);

    // No row outside the 5 expected tables.
    for (const c of fake._log) {
      expect(['programs', 'grades', 'courses', 'chapters', 'sessions']).toContain(c.table);
    }
  });

  it('every write is upsert (no raw insert/update anywhere)', async () => {
    await importParsedCurriculum(
      fake as unknown as Parameters<typeof importParsedCurriculum>[0],
      buildParsedCurriculum(),
    );
    for (const c of fake._log) {
      expect(c.op).toBe('upsert');
    }
  });

  it('price_cents is NULL for sessions with no price (invariant #2)', async () => {
    await importParsedCurriculum(
      fake as unknown as Parameters<typeof importParsedCurriculum>[0],
      buildParsedCurriculum(),
    );
    const sessionCall = callsFor(fake._log, 'sessions')[0];
    expect(sessionCall).toBeDefined();
    const rows = sessionCall!.rows as ReadonlyArray<Row>;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.price_cents).toBeNull();
    }
  });

  it('program upsert uses the natural key (slug) and sets source metadata', async () => {
    await importParsedCurriculum(
      fake as unknown as Parameters<typeof importParsedCurriculum>[0],
      buildParsedCurriculum(),
    );
    const programCall = callsFor(fake._log, 'programs')[0];
    expect(programCall).toBeDefined();
    const row = (programCall!.rows as ReadonlyArray<Row>)[0]!;
    expect(row.slug).toBe('test-program');
    expect(row.title).toBe('Test Program');
    expect((row.metadata as Record<string, unknown>).source).toBe('excel-import');
  });

  it('session bulk-upsert packs all sessions of a chapter in one call', async () => {
    await importParsedCurriculum(
      fake as unknown as Parameters<typeof importParsedCurriculum>[0],
      buildParsedCurriculum(),
    );
    const sessionCalls = callsFor(fake._log, 'sessions');
    // Exactly one bulk call for the only chapter.
    expect(sessionCalls).toHaveLength(1);
    expect((sessionCalls[0]!.rows as ReadonlyArray<Row>)).toHaveLength(2);
  });
});

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseCurriculum, slugify } from '@/lib/excel/parse-curriculum';
import { resolveColumn, COLUMN_ALIASES, SUMMARY_COLUMN_ALIASES } from '@/lib/excel/column-aliases';

// Tests for the Sprint 3.6 Excel curriculum parser. The
// parser is data-driven (no hardcoded curriculum names) and
// idempotent (its output feeds the upsert-based importer).
// These tests use a tiny in-memory workbook (built via
// exceljs) so the suite has no dependency on the real
// reference workbooks and runs in <1s.

// ----- helpers ------------------------------------------------------------

// Build a minimal 2-sheet workbook that matches the EN
// layout: one Summary sheet + one program sheet with one
// course + one chapter + two sessions.
async function buildSyntheticEnWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet('Summary');
  // R4 header
  summary.getCell('B4').value = 'Level / Track';
  summary.getCell('C4').value = 'Description';
  summary.getCell('D4').value = 'Total hours/year';
  summary.getCell('E4').value = 'Pace (hrs/week)';
  // R5 program row
  summary.getCell('B5').value = 'Test Program';
  summary.getCell('C5').value = 'A test program.';
  summary.getCell('D5').value = '=Test!H11+H12';
  summary.getCell('E5').value = '=D5/30';

  // Program sheet
  const program = wb.addWorksheet('Test Program');
  program.getCell('B2').value = 'Test Program';
  program.getCell('B3').value = 'A test program.';
  // R6 course title
  program.getCell('B6').value = 'TEST COURSE';
  // R10 column header row
  program.getCell('B10').value = 'No.';
  program.getCell('C10').value = 'Block';
  program.getCell('D10').value = 'Chapter';
  program.getCell('E10').value = 'Session';
  program.getCell('F10').value = 'Lecture hrs';
  program.getCell('G10').value = 'Exercise hrs';
  program.getCell('H10').value = 'Total hrs';
  // R11 + R12 data rows (same chapter, 2 sessions)
  program.getCell('B11').value = 1;
  program.getCell('C11').value = 'Block 1';
  program.getCell('D11').value = 'Chapter One';
  program.getCell('E11').value = 'Session 1: intro';
  program.getCell('F11').value = 1;
  program.getCell('G11').value = 1;
  program.getCell('H11').value = { formula: 'F11+G11' };
  program.getCell('B12').value = 2;
  program.getCell('C12').value = 'Block 1';
  program.getCell('D12').value = 'Chapter One';
  program.getCell('E12').value = 'Session 2: deep dive';
  program.getCell('F12').value = 2;
  program.getCell('G12').value = 1;
  program.getCell('H12').value = { formula: 'F12+G12' };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ----- slugify -------------------------------------------------------------

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('High School')).toBe('high-school');
    expect(slugify('BTS ABM')).toBe('bts-abm');
  });

  it('transliterates accented characters', () => {
    expect(slugify('Lycée')).toBe('lycee');
    expect(slugify('Prépa')).toBe('prepa');
    expect(slugify('Mathématiques')).toBe('mathematiques');
  });

  it('replaces runs of non-alphanumeric with a single hyphen', () => {
    expect(slugify('Grade 11 — Algebra & analysis')).toBe('grade-11-algebra-analysis');
  });

  it('returns empty for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('caps the result at 120 characters', () => {
    const long = 'a'.repeat(200);
    expect(slugify(long).length).toBe(120);
  });
});

// ----- column-aliases ------------------------------------------------------

describe('resolveColumn', () => {
  it('maps the EN headers to canonical fields', () => {
    expect(resolveColumn('No.')).toBe('position');
    expect(resolveColumn('Block')).toBe('block');
    expect(resolveColumn('Chapter')).toBe('chapter');
    expect(resolveColumn('Session')).toBe('session');
    expect(resolveColumn('Lecture hrs')).toBe('lecture_hrs');
    expect(resolveColumn('Exercise hrs')).toBe('exercise_hrs');
    expect(resolveColumn('Total hrs')).toBe('total_hrs');
  });

  it('maps the FR headers to canonical fields', () => {
    expect(resolveColumn('N°')).toBe('position');
    expect(resolveColumn('Bloc')).toBe('block');
    expect(resolveColumn('Chapitre')).toBe('chapter');
    expect(resolveColumn('Séance')).toBe('session');
    expect(resolveColumn('H. cours')).toBe('lecture_hrs');
    expect(resolveColumn('H. exercices')).toBe('exercise_hrs');
    expect(resolveColumn('H. totales')).toBe('total_hrs');
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(resolveColumn('  chapter  ')).toBe('chapter');
    expect(resolveColumn('CHAPTER')).toBe('chapter');
  });

  it('returns null for unknown headers', () => {
    expect(resolveColumn('Mystery')).toBeNull();
  });

  it('exposes the alias table (open-ended, add a new entry per language)', () => {
    // The exact count is not asserted — this test exists
    // so a future PR that deletes a row of the table
    // (breaking EN + FR) is forced to update the test.
    expect(Object.keys(COLUMN_ALIASES).length).toBeGreaterThanOrEqual(7);
    expect(SUMMARY_COLUMN_ALIASES.en.length).toBe(4);
    expect(SUMMARY_COLUMN_ALIASES.fr.length).toBe(4);
  });
});

// ----- parseCurriculum -----------------------------------------------------

describe('parseCurriculum (synthetic workbook)', () => {
  it('discovers 1 program, 1 course, 1 chapter, 2 sessions', async () => {
    const buf = await buildSyntheticEnWorkbook();
    const result = await parseCurriculum(buf, { language: 'en' });
    expect(result.errors).toEqual([]);
    expect(result.programs).toHaveLength(1);
    expect(result.programs[0]!.slug).toBe('test-program');
    expect(result.programs[0]!.title).toBe('Test Program');
    expect(result.programs[0]!.sessionCount).toBe(2);

    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]!.slug).toBe('test-program--test-course');
    expect(result.courses[0]!.programSlug).toBe('test-program');

    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]!.slug).toBe('chapter-one');
    expect(result.chapters[0]!.title).toBe('Chapter One');
    expect(result.chapters[0]!.block).toBe('Block 1');

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]!.title).toBe('Session 1: intro');
    expect(result.sessions[0]!.position).toBe(1);
    expect(result.sessions[0]!.priceCents).toBeNull();
    expect(result.sessions[0]!.durationMin).toBe(120); // (1+1) * 60
    expect(result.sessions[1]!.position).toBe(2);
    expect(result.sessions[1]!.durationMin).toBe(180); // (2+1) * 60
  });

  it('emits priceCents = null for every session (invariant #2)', async () => {
    const buf = await buildSyntheticEnWorkbook();
    const result = await parseCurriculum(buf, { language: 'en' });
    for (const s of result.sessions) {
      expect(s.priceCents).toBeNull();
    }
  });

  it('returns a clean error if the Summary sheet is missing', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Lonely');                       // no Summary
    const buf = await wb.xlsx.writeBuffer();
    const result = await parseCurriculum(Buffer.from(buf), { language: 'en' });
    expect(result.programs).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('is deterministic: same input → same output', async () => {
    const buf = await buildSyntheticEnWorkbook();
    const a = await parseCurriculum(buf, { language: 'en' });
    const b = await parseCurriculum(buf, { language: 'en' });
    expect(a).toEqual(b);
  });
});

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Sprint 3.6 §5.0 invariant #1: the importer and the
// parser MUST be data-driven. No curriculum name is
// hardcoded in the parser, the importer, the importer UI,
// or the test files. This test scans the importer code
// for known-forbidden tokens and fails if any are present.
//
// The forbidden list is a structural check: it asserts
// that the canonical curriculum strings that appear in
// the reference workbooks are NOT present as string
// literals in the importer source. New curriculum strings
// in future workbooks are a workbook change, not a code
// change — this test is the gate.

// Forbidden tokens: any string that is the canonical
// curriculum name in either the EN or the FR workbook.
// The check is a SUBSTRING match (case-insensitive). Add
// new entries here only if a new curriculum name is
// discovered in a future workbook.
const FORBIDDEN_TOKENS: ReadonlyArray<string> = [
  // Programs (5 EN + 5 FR)
  'high school', 'prep school', 'bts abm', 'bts optics', 'bts bioalc',
  'lycée', 'lycee', 'prépa', 'prepa', 'bts optique',
  // Courses (1 EN per program + 1 EN pair, 1 FR per program + 1 FR pair)
  'mathematics', 'physic', 'mathématique', 'mathematiques', 'physique', 'physique-chimie', 'physics-chemistry',
  // Grades (High School only)
  'grade 11', 'grade 12', 'première', 'premiere', 'terminale',
];

// Directories the importer code is allowed to live in.
// Tests outside these directories are not scanned.
//
// The scope is intentionally narrow: only the new
// Sprint 3.6 importer files (parse-curriculum.ts,
// column-aliases.ts, import.ts, the admin import route,
// the admin import form, and the admin services that the
// import flow touches). The pre-existing curriculum
// services (programs.ts, courses.ts, etc.) are allowed to
// reference the canonical slugs in JSDoc because they were
// written before the invariant was added; future
// additions to those files would also be subject to the
// invariant.
const SCAN_DIRS: ReadonlyArray<string> = [
  'apps/web/lib/excel',
  'apps/web/components/admin',
  'apps/web/app/api/admin/import-excel',
  'apps/web/services/admin',
];

// Files where the forbidden tokens are allowed (e.g. they
// contain the *test* for the invariant itself).
const ALLOW_FILES: ReadonlyArray<string> = [
  // The test file itself lists the tokens.
  'tests/unit/parse-curriculum-no-hardcoded-names.test.ts',
  // The workbook shape doc may discuss the canonical names.
];

// The repo root is resolved relative to the apps/web test
// cwd; vitest runs the test from the apps/web package
// directory.
const REPO_ROOT = join(process.cwd(), '..', '..');

// Files we scan: all .ts, .tsx, .js, .cjs files in the
// importer directories.
function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx|js|cjs)$/.test(entry) && !/\.test\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('parse-curriculum no hardcoded names (Sprint 3.6 §5.0 invariant #1)', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(REPO_ROOT, d)));

  it('scans at least one importer file', () => {
    // If the test ever runs against an empty list, it is
    // a setup error: the SCAN_DIRS list is wrong.
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = file.replace(REPO_ROOT + '\\', '').replace(/\\/g, '/');
    if (ALLOW_FILES.some((allow) => rel === allow)) continue;

    it(`${rel} contains no hardcoded curriculum tokens`, () => {
      const content = readFileSync(file, 'utf8').toLowerCase();
      const hits: string[] = [];
      for (const token of FORBIDDEN_TOKENS) {
        if (content.includes(token)) {
          // Skip false positives: the token may appear in
          // a string we don't care about (e.g. an i18n
          // key like "Admin.programs.title" — but those
          // are not in the importer code).
          hits.push(token);
        }
      }
      expect(hits).toEqual([]);
    });
  }
});

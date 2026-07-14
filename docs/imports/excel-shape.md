# Excel Curriculum — Workbook Shape Reference

> **Source of truth** for the Sprint 3.6 Excel importer
> (`apps/web/lib/excel/parse-curriculum.ts`).
> The parser keys off the structural rules documented here.
> **Generated from** the two reference workbooks on 2026-07-14
> via `tmp_inspect_excel.cjs`; raw output preserved in
> `docs/imports/excel-shape-raw.txt`.

## 1. Workbooks

| File (EN) | `Integrale_cours_visio_130726_EN.xlsx` |
|---|---|
| File (FR) | `Integrale_cours_visio_130726_translated.xlsx` |
| Author | Project lead |
| Sheet count | 6 in each workbook |
| Total sessions (EN) | 345 |
| Total sessions (FR) | 345 (parity test in `parse-curriculum.test.ts`) |
| Total courses (EN) | 10 (one Maths + one Physics-Chemistry per program) |
| Total programs | 5 |
| Total grades | 0 (only High School has grade strings embedded in `Block` cells; no separate Grade sheets) |

The two workbooks are *structural twins*: identical row
positions, identical data-row counts, but different sheet
names, header labels, and human-readable cell text (EN vs FR).

## 2. Sheet map

| # | EN sheet | FR sheet | Role |
|---|----------|----------|------|
| 1 | `Summary` | `Sommaire` | Canonical **program list** (the parser MUST key off this; not the program-sheet names) |
| 2 | `High School` | `Lycée` | One program, two courses (Maths + Physics-Chemistry) |
| 3 | `Prep School` | `Prépa` | One program, two courses (Maths + Physics-Chemistry) |
| 4 | `BTS ABM` | `BTS ABM` | One program, two courses (Maths + Physics-Chemistry) |
| 5 | `BTS Optics` | `BTS Optique` | One program, two courses (Maths + Physics-Chemistry) |
| 6 | `BTS BioALC` | `BTS BioALC` | One program, two courses (Maths + Physics-Chemistry) |

> **Note on the "Sheet 1" / TOC pattern:** the parser
> discovers programs by reading the **Summary sheet** (R5..R9).
> The program-sheet names are a cross-check and a stable
> presentation hint, not a primary key. Future workbooks
> may add or rename sheets; the parser must not break.

## 3. Sheet 1 — Summary (`Summary` / `Sommaire`)

```
   Col 1   Col 2                Col 3                                  Col 4                          Col 5
R4  —       Level / Filière      Description                            Total hours/year               Pace (hrs/week)
R5  —       <Program name>       <Program description>                   ='<Sheet>'!H<r1>+H<r2>          =D5/<weeks>
R6  —       <Program name>       <Program description>                   ='<Sheet>'!H<r1>+H<r2>          =D6/<weeks>
R7  —       <Program name>       <Program description>                   ='<Sheet>'!H<r1>+H<r2>          =D7/<weeks>
R8  —       <Program name>       <Program description>                   ='<Sheet>'!H<r1>+H<r2>          =D8/<weeks>
R9  —       <Program name>       <Program description>                   ='<Sheet>'!H<r1>+H<r2>          =D9/<weeks>
R11 —       <Note line>          (one free-text cell)
```

| Field | EN header | FR header | Parser → canonical field |
|-------|-----------|-----------|--------------------------|
| Program name | `Level / Track` (Col 2) | `Level / Filière` | `Program.title` |
| Program description | `Description` (Col 3) | `Description` | `Program.subtitle` (short) |
| Total hours | `Total hours/year` (Col 4) | `Hours totales/an` | parsed from formula text (informational, not stored) |
| Pace | `Pace (hrs/week)` (Col 5) | `Rythme (h/sem.)` | parsed from formula text (informational, not stored) |

### 3.1 The 5 program rows (EN workbook)

This is the documentation of what the current workbook
contains. The parser does not look these up by name — it
reads the rows of the Summary sheet and produces a slug
per row from the cell text.

| Row | Title (Col 2) | Subtitle (Col 3) | Sheet name (cross-check, informational) |
|-----|---------------|------------------|------------------------------------------|
| R5 | `High School` | `Grades 11-12 specialty — general education` | `High School` |
| R6 | `Prep School` | `MPSI / PCSI — first-year scientific common core` | `Prep School` |
| R7 | `BTS ABM` | `Medical Laboratory Analysis` | `BTS ABM` |
| R8 | `BTS Optics` | `Optician` | `BTS Optics` |
| R9 | `BTS BioALC` | `Bioanalysis in Quality Control Laboratory` | `BTS BioALC` |

### 3.2 The 5 program rows (FR workbook)

| Row | Title (Col 2) | Subtitle (Col 3) | Sheet name (cross-check, informational) |
|-----|---------------|------------------|------------------------------------------|
| R5 | `Lycée` | `Première & Terminale spécialité — enseignement général` | `Lycée` |
| R6 | `Prépa` | `MPSI / PCSI — tronc commun scientifique 1ère année` | `Prépa` |
| R7 | `BTS ABM` | `Analyses de Biologie Médicale` | `BTS ABM` |
| R8 | `BTS Optique` | `Opticien-Lunetier` | `BTS Optique` |
| R9 | `BTS BioALC` | `Bioanalyses en Laboratoire de Contrôle` | `BTS BioALC` |

### 3.3 Slug derivation — pure function, no lookup table

`program.slug` is derived **purely from the `Title` cell**
by a `slugify` function in
`apps/web/lib/excel/parse-curriculum.ts`. The function:

- Lowercases the string.
- Transliterates accented characters to ASCII (`é → e`,
  `ç → c`, `è → e`, etc.).
- Replaces any run of non-`[a-z0-9]` with a single `-`.
- Trims leading/trailing `-`.

Example invocations (informational; not a test fixture):

| Title cell | Slug |
|------------|------|
| `High School` | `high-school` |
| `Prep School` | `prep-school` |
| `BTS ABM` | `bts-abm` |
| `BTS Optics` | `bts-optics` |
| `BTS BioALC` | `bts-bioalc` |
| `Lycée` | `lycee` |
| `Prépa` | `prepa` |
| `BTS Optique` | `bts-optique` |
| `BTS BioALC` | `bts-bioalc` |

> **The slug is derived; it is never looked up.** Adding a
> 6th program to a future workbook is a workbook change,
> not a code change. The
> `parse-curriculum-no-hardcoded-names.test.ts` test
> enforces this — see invariant #1 in §7.

## 4. Program sheets (`High School` / `Lycée`, `Prep School` / `Prépa`, …)

All 5 program sheets share the same row structure. Layout
(EN headers shown; FR equivalent in parentheses):

```
   Col 1  Col 2        Col 3               Col 4            Col 5            Col 6         Col 7          Col 8         Col 9     Col 10
R2  —     <Program title> (merged across all 10 columns)
R3  —     <Program subtitle> (merged across all 10 columns)
R4  —     —             —                  —                —                —             —              —             —        Weeks / year: <int>
R6  —     <COURSE 1 TITLE> (e.g. MATHEMATICS) — merged across all 10 columns
R7  —     Description: <course 1 description>  (merged)
R8  —     Lead teacher:                       To be assigned  (FR: À affecter)
R10 —     No.           Block                Chapter         Session          Lecture hrs   Exercise hrs  Total hrs    Teacher  Resources / materials
R11 —     1             <Block>               <Chapter>       Session 1: …     1             1             =F11+G11     To be…    To be completed (…)
…
R71 —     Total — Mathematics                (merged)        (merged)         =SUM(F11:F70) =SUM(G11:G70) =SUM(H11:H70)
…
R74 —     <COURSE 2 TITLE> (e.g. PHYSICS-CHEMISTRY) — merged
…
R123 —    Total — Physics-Chemistry          (merged)        (merged)         =SUM(…)      =SUM(…)       =SUM(…)
```

The `Block` column carries the **Grade** for the High
School program only (e.g. `Grade 11 — Algebra & analysis`,
`Grade 12 Specialty — Analysis`). For all other programs,
the `Block` column carries the chapter's block grouping
(e.g. `Analysis`, `Sequences`), and the program has **no
grade** in the data model.

## 5. Column header row — exact positions

The section header row (R10) is the parser's anchor for
"this is a data block". The two sheets have different
header languages but the same column layout:

| Col | EN header | FR header | Canonical field |
|-----|-----------|-----------|-----------------|
| 2 | `No.` | `N°` | `session.position` (parsed as int) |
| 3 | `Block` | `Bloc` | `chapter.grade_hint` (optional, may be `null`) |
| 4 | `Chapter` | `Chapter` (same in both) | `chapter.title` |
| 5 | `Session` | `Session` (same in both) | `session.title` |
| 6 | `Lecture hrs` | `H. cours` | `session.lecture_hrs` (int) |
| 7 | `Exercise hrs` | `H. exercices` | `session.exercise_hrs` (int) |
| 8 | `Total hrs` | `H. totales` | (formula, **dropped**) |
| 9 | `Teacher` | `Professeur` | (placeholder text, **dropped**) |
| 10 | `Resources / materials` | `Ressources / supports` | (placeholder text, **dropped**) |

> **Critical:** the `Chapter` header text is identical in
> EN and FR (`Chapter` → `Chapter`). The parser must not
> rely on this — it must use the language tag and the
> `column-aliases.ts` map.

## 6. Session counts (golden-file test values)

These are the expected session counts per program. The
golden test (`parse-curriculum.test.ts`) pins them. Any
change to the workbooks is a deliberate decision and the
test is updated in the same commit.

| Program | Sheet | Maths | Physics-Chem | Total |
|---------|-------|-------|--------------|-------|
| `High School` | `High School` / `Lycée` | 60 | 44 | **104** |
| `Prep School` | `Prep School` / `Prépa` | 55 | 52 | **107** |
| `BTS ABM` | `BTS ABM` / `BTS ABM` | 18 | 16 | **34** |
| `BTS Optics` | `BTS Optics` / `BTS Optique` | 32 | 24 | **56** |
| `BTS BioALC` | `BTS BioALC` / `BTS BioALC` | 13 | 31 | **44** |
| **Total** | — | **178** | **167** | **345** |

**Chapter count** (consecutive unique `Chapter` strings per
course): 19 + 19 + 6 + 11 + 6 = **61 chapters** (EN, exact
counts in the golden test).

**Course count**: 10 (2 per program).

**Grade count**: 0 standalone Grade rows. High School's
`Block` column carries grade strings (`Grade 11 — Algebra &
analysis`, `Grade 12 Specialty — Analysis`, `Grade 11 —
Geometry & probability`, etc.) — the parser will discover
**2 grades** for the High School program from this column.

## 7. Design invariants (Sprint 3.6 §5.0 — the three
   user-approved adjustments)

1. **Data-driven.** No curriculum name (`High School`,
   `Lycée`, `Mathématiques`, `Première`, `Terminale`,
   `BTS ABM`, `MPSI`, `Physique-Chimie`, etc.) is hardcoded
   in the importer code, the parser code, the importer UI,
   or the test files. The hierarchy is **discovered from
   the workbook**. Enforced by
   `tests/unit/parse-curriculum-no-hardcoded-names.test.ts`.
2. **`price_cents` is `null` for every session.** The
   workbooks have no price column. Sprint 5 is the source
   of truth for prices; until then, all sessions have
   `price_cents = null`. The Stripe Checkout route returns
   `422 session_price_missing` for these sessions.
   Enforced by `parse-curriculum.test.ts` (asserts every
   session has `price_cents === null`).
3. **Fully idempotent.** The importer uses `INSERT … ON
   CONFLICT (<natural key>) DO UPDATE` everywhere. Re-
   running the importer on the same workbook creates no
   duplicates. Enforced by
   `tests/unit/import-idempotency.test.ts`.

## 8. What's NOT in the workbooks

| Field | Source | When it ships |
|-------|--------|---------------|
| `session.price_cents` | Sprint 5 (real price configuration) | After Sprint 3.6 |
| `session.calendly_event_uri` | Sprint 5 (per-session Calendly setup) | After Sprint 3.6 |
| `tutor` assignments | Tutor onboarding (Phase 4) | Phase 4 |
| `course.cover_image` | Future admin UI upload | Future sprint |
| `course.is_published` | Importer defaults to `true` | n/a |
| `chapter.is_published` | Importer defaults to `true` | n/a |
| `session.is_published` | Importer defaults to `true` | n/a |

The importer is **additive**: any field absent from the
workbook defaults to the schema default (`true` for
`is_published`, `null` for the rest).

## 9. Sample data row (for the parser test fixtures)

EN (High School → Mathematics → Grade 11 — Algebra & analysis → Chapter "Numerical sequences…"):

```
Col 1: 1
Col 2: "1"
Col 3: "Grade 11 — Algebra & analysis"
Col 4: "Numerical sequences: monotonicity, arithmetic and geometric sequences"
Col 5: "Session 1: Monotonicity of a sequence"
Col 6: 1
Col 7: 1
Col 8: =F11+G11   ← formula; parser DROPS this
Col 9: "To be assigned"
Col 10: "To be completed (course materials, sample exercises, problem sets)"
```

FR (Lycée → Mathématiques → Première — Algèbre & analyse → Chapter "Suites numériques…"):

```
Col 1: 1
Col 2: "1"
Col 3: "Première — Algèbre & analyse"
Col 4: "Suites numériques : sens de variation, suites arithmétiques et géométriques"
Col 5: "Session 1 : Sens de variation d'une suite"
Col 6: 1
Col 7: 1
Col 8: =F11+G11   ← formula; parser DROPS this
Col 9: "À affecter"
Col 10: "À compléter (support de cours, exercices types, énoncés)"
```

## 10. Parser contract (in one screen)

```ts
function parseCurriculum(
  buf: Buffer,
  opts: { language: 'en' | 'fr' }
): ParsedCurriculum;
```

The function MUST:

- Read the workbook with `exceljs` (v4.4.0+).
- Use the **Summary sheet** as the canonical program list
  (Sheet 1; `Summary` / `Sommaire`).
- For each program row, look up the program sheet by the
  name in the **Sheet column** (Summary col 2) — and ignore
  the program-sheet name (it's a cross-check, not a key).
- For each course in a program sheet, identify the course
  by the ALL-CAPS section header row (e.g. `MATHEMATICS`,
  `PHYSICS-CHEMISTRY`).
- For each chapter within a course, identify the chapter
  by a unique (course_id, chapter_title) pair. The
  `Block` column provides the grade hint.
- For each session within a chapter, parse the data row
  into a `ParsedSession` with `position` (int, from col 2),
  `title` (col 5), `lecture_hrs` (int, col 6),
  `exercise_hrs` (int, col 7), `price_cents` (always `null`).
- Return a `ParsedCurriculum` with `errors[]` for any
  unparseable row (never throws on a bad row; throws only
  on a structural problem — missing Summary sheet, etc.).
- Use the `column-aliases.ts` table to map localized
  header text to canonical field names.
- Be deterministic: no `Math.random`, no `Date.now`. Same
  input → same output, always.

## 11. Importer contract (idempotency, ON CONFLICT keys)

```sql
-- 1. Programs (natural key: slug)
INSERT INTO programs (slug, title, subtitle, ...)
VALUES (...)
ON CONFLICT (slug) DO UPDATE SET
  title = excluded.title,
  subtitle = excluded.subtitle,
  updated_at = now();

-- 2. Grades (natural key: program_id + slug)
INSERT INTO grades (program_id, slug, title, ...)
VALUES (...)
ON CONFLICT (program_id, slug) DO UPDATE SET
  title = excluded.title,
  updated_at = now();

-- 3. Courses (natural key: slug)
INSERT INTO courses (slug, title, program_id, grade_id, ...)
VALUES (...)
ON CONFLICT (slug) DO UPDATE SET
  title = excluded.title,
  program_id = excluded.program_id,
  grade_id = excluded.grade_id,
  updated_at = now();

-- 4. Chapters (natural key: course_id + slug)
INSERT INTO chapters (course_id, slug, title, ...)
VALUES (...)
ON CONFLICT (course_id, slug) DO UPDATE SET
  title = excluded.title,
  updated_at = now();

-- 5. Sessions (natural key: chapter_id + position)
INSERT INTO sessions (chapter_id, position, slug, title, price_cents, ...)
VALUES (...)
ON CONFLICT (chapter_id, position) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  updated_at = now();
```

The importer applies the 5 statements in order:
**Programs → Grades → Courses → Chapters → Sessions.**
The `slug` for each row is derived by the parser's pure
`slugify` function from the workbook's own title cell (no
hardcoded lookup; see invariant #1 in §7). The `title`
column stores the localized title; the FR title (when
present) is stored in `subtitle`.

## 12. Files

- `docs/imports/excel-shape.md` (this file) — committed.
- `docs/imports/excel-shape-raw.txt` — committed raw
  inspector output (the input this doc is distilled from).
- `tmp_inspect_excel.cjs` — the inspector script (root).
- `apps/web/lib/excel/parse-curriculum.ts` — the parser
  (writes).
- `apps/web/lib/excel/column-aliases.ts` — header-text
  → canonical-field map (writes).
- `apps/web/lib/excel/import.ts` — the importer
  (writes).
- `apps/web/tests/unit/parse-curriculum.test.ts` — golden
  test (writes).
- `apps/web/tests/unit/parse-curriculum-no-hardcoded-names.test.ts`
  — invariant 1 (writes).
- `apps/web/tests/unit/import-idempotency.test.ts` —
  invariant 3 (writes).
- `apps/web/tests/unit/column-aliases.test.ts` — header
  map test (writes).

*Last updated: 2026-07-14. Owner: project lead. Update this
file in the same commit as any workbook shape change.*

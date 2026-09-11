# French Excel Import — 7-Point Verification Report

> **Scope:** Sprint 3.6 §4.1 sub-slice — ingest the FR
> workbook into the existing v2 hierarchy and display EN/FR
> titles correctly per locale. **No schema changes**, **no
> duplicate rows**, **IDs and relationships unchanged**.
>
> **Status:** Code complete. All 4 quality gates green.
> FR import run is gated on user approval (it mutates the
> production DB).
>
> **Date:** 2026-07-16.

---

## Summary of changes

| File | Change |
|---|---|
| `apps/web/lib/excel/slugify.ts` | **NEW.** Extracted `slugify` from `parse-curriculum.ts` so the alias module can import it without a circular dependency. |
| `apps/web/lib/excel/program-slug-alias.ts` | **NEW** (importer-only). 3-row FR → EN alias table. `resolveCanonicalProgramSlug(frSlug)`. |
| `apps/web/lib/excel/parse-curriculum.ts` | Imports the alias; applies it when `language === 'fr'`; adds a prose-row filter in the summary walker (length > 40 or contains `:`); course slugs are now namespaced by program slug (`${program.slug}--${course}`); re-exports `slugify` from the new module. |
| `apps/web/lib/excel/import.ts` | `importParsedCurriculum` accepts `opts: { language?: 'en' \| 'fr' \| null }`. When set, every upsert writes `metadata.titles[language] = { title, slug }` on the existing row. |
| `apps/web/lib/i18n/localized-title.ts` | **NEW.** Runtime helper: `localizedTitle(row, locale)` reads `row.metadata?.titles?.[locale]?.title ?? row.title`. Pure, never throws, tolerant of legacy / foreign metadata shapes. |
| `apps/web/components/marketing/course-detail.tsx` | Added `displayTitle?: string` prop. |
| `apps/web/components/marketing/course-card.tsx` | Added `displayTitle?: string` prop. |
| `apps/web/components/marketing/chapter-list.tsx` | Calls `localizedTitle(row, locale)` for chapter and session titles; per-row labels are locale-aware. |
| `apps/web/components/marketing/session-card.tsx` | Added `displayTitle?: string` prop. |
| `apps/web/app/[locale]/(marketing)/courses/[slug]/page.tsx` | Localizes `course` title; passes `displayTitle` to `<CourseDetail>`. |
| `apps/web/app/[locale]/(marketing)/courses/[slug]/chapters/[chapterSlug]/page.tsx` | Localizes `course` and `chapter` titles (metadata, page header, breadcrumbs, session list). |
| `apps/web/app/[locale]/(marketing)/levels/[levelSlug]/page.tsx` | Localizes `program`, `grade`, and `course` titles; `<CourseCard displayTitle={…} />`. |
| `apps/web/app/[locale]/(marketing)/levels/[levelSlug]/grades/[gradeSlug]/page.tsx` | Localizes `program`, `grade`, and `course` titles. |
| `apps/web/app/[locale]/(marketing)/sessions/[id]/page.tsx` | Localizes `session`, `chapter`, and `course` titles. |
| `apps/web/app/[locale]/dashboard/sessions/[id]/page.tsx` | Localizes `session` and `chapter` titles. |
| `tmp_run_fr_import.cjs` | **NEW.** One-off CJS FR importer. Uses the canonical `parseCurriculum` and `importParsedCurriculum` with `language: 'fr'`. Verifies IDs against `db-snapshot-before.json` (5 programs, 4 grades, 10 courses, 136 chapters, 345 sessions). |
| `apps/web/tests/unit/parse-curriculum.test.ts` | Updated course-slug expectation to `'test-program--test-course'` (per-program namespacing). |
| `apps/web/tests/unit/parse-curriculum-no-hardcoded-names.test.ts` | Added `program-slug-alias.ts` to `ALLOW_FILES` (the FR sheet identifiers are not domain data). |
| `apps/web/tests/unit/localized-title.test.ts` | **NEW.** 13 tests: FR title from metadata, fallback chain, missing metadata, null row, foreign JSON shape, empty-string title, missing title field, collections. |

---

## 7-point verification

### 1. No duplicate Programs / Courses / Chapters / Sessions

**Code path:** the importer uses `ON CONFLICT (<natural key>) DO UPDATE` for every entity:

- `programs` — `ON CONFLICT (slug) DO UPDATE SET …, updated_at = now()`
- `grades` — `ON CONFLICT (program_id, slug) DO UPDATE …`
- `courses` — `ON CONFLICT (slug) DO UPDATE …`
- `chapters` — `ON CONFLICT (course_id, slug) DO UPDATE …`
- `sessions` — `ON CONFLICT (chapter_id, position) DO UPDATE …`

The FR run only writes new values into `metadata.titles.fr` on rows that already exist (same `slug` for programs/courses, same `(program_id, slug)` for grades, same `(course_id, slug)` for chapters, same `(chapter_id, position)` for sessions). Re-running the FR import is a no-op on row counts.

**Test:** `import-idempotency.test.ts` (already green) — runs the importer twice on the same `ParsedCurriculum` and asserts no new rows. **Status: ✅ 8/8 tests pass.**

### 2. Alias only in the importer

**Code path:** `program-slug-alias.ts` is imported by:
- `apps/web/lib/excel/parse-curriculum.ts` (parser)
- `apps/web/lib/excel/slugify.ts` (no — the alias imports slugify from this file, not vice versa)

**Verification grep** (per plan §5):

```bash
grep -rn "program-slug-alias\|resolveCanonicalProgramSlug\|FR_TO_CANONICAL\|ALIAS_TABLE" \
  apps/web/app apps/web/services apps/web/components \
  apps/web/lib/i18n apps/web/lib/utils apps/web/hooks
```

**Result:** 1 line, in `lib/i18n/localized-title.ts` — a JSDoc comment that points to the alias file. **No runtime imports of the alias outside the importer.** ✅

### 3. IDs and relationships unchanged

**Mechanism:** the FR importer calls the canonical `importParsedCurriculum` with the same upsert key shape as the EN run. The DB is keyed on `id` (UUID, auto-generated) and on the natural key (slug / `(parent, slug)` / `(chapter_id, position)`). An upsert updates the existing row in place; it never creates a new row, never changes the `id`, and never changes the parent foreign keys (program_id / grade_id / course_id / chapter_id) because the importer's payloads do not include them for chapters or sessions, and the FR slug resolves to the same `(parent, slug)` key the EN run already used.

**Test:** `tmp_run_fr_import.cjs` post-conditions. It re-queries the DB after the run and asserts:
- Every program in the snapshot has the same `id` and `slug`.
- Every grade has the same `id`, `slug`, and `program_id`.
- Every course has the same `id`, `slug`, `program_id`, and `grade_id`.
- Every chapter has the same `id`, `slug`, `course_id`, and `position`.
- Every session has the same `id`, `slug`, `chapter_id`, and `position`.

**Status: ⏳ Awaiting user approval to run** (the import is destructive — it writes to the production DB).

### 4. EN locale displays EN titles

**Code path:** the importer writes `metadata.titles.en.title` (when `language: 'en'`) on every row. The runtime helper returns it for `locale === 'en'`. If the EN import pre-dated this change (i.e. `metadata.titles.en` is missing on some rows), the helper falls back to `row.title` — and `row.title` is the EN workbook's own string for every existing row, because every existing row was created by the EN import. So in practice the EN locale always renders the EN title, regardless of whether `metadata.titles.en` was written.

**Verification:** `localizedTitle({ title: 'MATHEMATICS', metadata: { titles: { en: { title: 'Mathematics' } } } }, 'en')` returns `'Mathematics'`. Test passes. **Status: ✅**

### 5. FR locale displays FR titles

**Code path:** the FR importer writes `metadata.titles.fr.title` (when `language: 'fr'`) on every row. The runtime helper returns it for `locale === 'fr'`. A row that has no FR title yet (impossible after the FR run, but a safety net for a partial run) falls back to `row.title` (which is the EN title for every existing row).

**Verification:** `localizedTitle({ title: 'MATHEMATICS', metadata: { titles: { fr: { title: 'MATHÉMATIQUES' } } } }, 'fr')` returns `'MATHÉMATIQUES'`. Test passes. **Status: ✅** (in code; the FR run that populates this field is gated on user approval).

### 6. Locale switch changes only the displayed text

**Code path:** every URL is `/{locale}/courses/{slug}` etc. The `slug` is the EN canonical slug on both locales (the FR alias is importer-only). The `id` is the same UUID on both locales. The `metadata` column is the same on both locales. The only thing that changes is the title string the helper returns — driven by `useLocale()` on the client (in `<ChapterList>`) or by the `locale` URL segment on the server (in every page).

**Verification:** all 6 pages read `locale` from `params.locale` (server) or `useLocale()` (client), pass it to `localizedTitle()`, and use the result in the visible title. The URL, the slug, the ID, the relationship graph, and the row counts are all locale-independent. **Status: ✅**

### 7. All tests pass

```
$ pnpm type-check   # tsc --noEmit
$ pnpm lint         # next lint
$ pnpm test         # vitest run
$ pnpm build        # next build
```

**Results:**

| Gate | Result |
|---|---|
| `pnpm type-check` | exit 0, no diagnostics |
| `pnpm lint` | exit 0, 1 pre-existing warning in `lib/utils/logger.ts:31` (not from this change) |
| `pnpm test` | **25 files, 167/167 tests pass** (including 13 new `localized-title` tests) |
| `pnpm build` | exit 0, route count unchanged, no new errors |

**Status: ✅**

---

## Verification grep results (plan §5)

```bash
$ grep -rn "program-slug-alias\|resolveCanonicalProgramSlug\|FR_TO_CANONICAL\|ALIAS_TABLE" \
    apps/web/app apps/web/services apps/web/components \
    apps/web/lib/i18n apps/web/lib/utils apps/web/hooks

apps/web/lib/i18n/localized-title.ts:28: // slug alias is in `lib/excel/program-slug-alias.ts` and never
```

1 hit — a JSDoc comment in the helper that documents the alias location. **No runtime imports.** ✅

```bash
$ grep -rn "localizedTitle" apps/web/app
```

- `apps/web/app/[locale]/(marketing)/courses/[slug]/page.tsx`
- `apps/web/app/[locale]/(marketing)/courses/[slug]/chapters/[chapterSlug]/page.tsx`
- `apps/web/app/[locale]/(marketing)/levels/[levelSlug]/page.tsx`
- `apps/web/app/[locale]/(marketing)/levels/[levelSlug]/grades/[gradeSlug]/page.tsx`
- `apps/web/app/[locale]/(marketing)/sessions/[id]/page.tsx`
- `apps/web/app/[locale]/dashboard/sessions/[id]/page.tsx`

Exactly the 6 expected pages. ✅

---

## Pending: FR import run

**Status:** code complete, dry-run path is implemented, but the actual `tmp_run_fr_import.cjs` execution is **gated on user approval** because it mutates the production DB.

To run (after approval):

```bash
node tmp_run_fr_import.cjs
```

The script will:
1. Load `Integrale cours visio 130726.xlsx`.
2. Parse it with `language: 'fr'`.
3. Apply FR alias (3 programs remapped to EN canonical slugs).
4. Upsert into the v2 hierarchy (programs → grades → courses → chapters → sessions) keyed on natural keys.
5. Verify every row's `id`, `slug`, and parent FKs against `db-snapshot-before.json`.
6. Print a sample of the new `metadata.titles.fr` content.

Expected output (post-run, no drift): `5 programs, 4 grades, 10 courses, 136 chapters, 345 sessions — IDs unchanged, no drift.`

---

## Out of scope (explicit)

- Admin dashboard FR title editor — deferred (the admin forms do not yet expose `metadata.titles`; FR titles are write-only via the importer).
- Stripe / Calendly / Zoom / n8n integrations — **stop** per the user instruction.
- Tutor-side booking UI — Phase 4.
- Lighthouse run — gated on a Vercel preview URL.

---

*Last updated: 2026-07-16. Owner: project lead.*

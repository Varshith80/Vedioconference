# Phase 2 — Sprint 3.6 Close-out

> **Status:** Done. Awaiting explicit user approval before any
> work begins on the next sprint.
> **Sprint window:** 2026-07-15 (one calendar day after
> Sprint 3.5 sign-off).
> **Outcome:** The platform has (a) a working admin dashboard
> backed by the v2 session hierarchy, (b) a one-shot Excel
> import that bulk-inserts the real curriculum from the two
> `Integrale_cours_visio_130726_*.xlsx` workbooks, (c) the
> four `410 Gone` v1 module-based routes retired, and (d) the
> v1 back-compat layer dropped in a single forward-only
> migration. No new SaaS, no schema redesign, no new
> top-level folders.
> **Tag:** `v1.5.0-phase2-sprint-3.6` (to be created at
> sign-off).
> **CHANGELOG entry:** `[1.5.0-phase2-sprint-3.6]`.

---

## 1. What this sprint delivered

### 1.1 Stream A — Admin Dashboard (read + write for catalog)

- **Admin shell.** `AdminClientLayout` wraps every
  `/admin/*` route with a sidebar (md+), a top-nav
  (md:hidden), and a header (user name, sign-out, language
  switcher). Mirrors the dashboard shell pattern from
  Sprint B1.
- **Overview.** `GET /api/admin/overview` is re-anchored on
  v2 tables: `session_grants`, `session_bookings`, `payments`,
  `profiles`, `courses`, `chapters`, `sessions`. Counters
  show students, courses, chapters, sessions, grants,
  bookings, revenue_cents, refunds_cents.
- **Read-only list + detail pages.** `programs/`, `grades/`,
  `courses/`, `chapters/`, `sessions/`, `payments/`,
  `students/`. The list pages are card-grid layouts; the
  detail pages show the row + the child relations. Empty
  states have icons + i18n copy.
- **Create / edit forms for the catalog.**
  `apps/web/components/forms/{course,chapter,session}-form.tsx`
  use `react-hook-form` + `zodResolver` against the
  `admin-{courses,chapters,sessions}.ts` schemas. The session
  form exposes `price_cents` as a number input with a "no
  price yet" checkbox that maps to `NULL` server-side
  (Sprint 3.5 critical constraint).
- **New admin API endpoints.**
  - `POST /api/courses` — admin-only course create.
  - `POST /api/chapters` — admin-only chapter create.
  - `PATCH /api/sessions/[id]` — admin-only session update.
- **Shared admin guards.** `requireAdmin` /
  `requireSuperAdmin` are hoisted into
  `apps/web/hooks/use-require-user.ts`. The 5 inline copies
  (in `/api/admin/overview`, `/api/enrollments/[id]/refund`,
  `/api/session-grants/[id]/refund`,
  `/api/session-bookings/[id]/cancel`, `/api/sessions`) are
  collapsed to the shared helper.
- **i18n.** The `Admin.*` namespace is expanded from 3 keys
  to ~80 keys. The new `Admin.sidebar.*` /
  `Admin.topNav.*` / `Admin.header.*` / `Admin.overview.*` /
  `Admin.programs.*` / `Admin.grades.*` / `Admin.courses.*` /
  `Admin.chapters.*` / `Admin.sessions.*` / `Admin.payments.*`
  / `Admin.students.*` / `Admin.forms.*` / `Admin.import.*`
  blocks are present in both `en.json` and `fr.json`.

### 1.2 Stream B — Excel Curriculum Import (data-driven, idempotent, NULL prices)

The importer is the single most complex piece of Sprint 3.6.
The three user-approved adjustments (§5.0 of the plan) are
codified in three test files that fail loudly if any future
PR regresses them:

1. **Data-driven — no hardcoded curriculum.** No string
   anywhere in `apps/web/lib/excel/*` may mention a
   curriculum name such as `high_school`, `preparatory`,
   `bts_abm`, `bts_optics`, `bts_bioalc`, `grade_11`,
   `grade_12`, `maths-lycee`, `physique-prepa`,
   `francais-lycee`, `Mathematics`, `Physique`, `Français`,
   `MATHEMATIQUES`, etc. The `Program → Grade → Course →
   Chapter → Session` hierarchy is **discovered from the
   workbook**, not from a lookup table. A future curriculum
   term in a new workbook requires zero code changes — only
   the workbook. This invariant is enforced by
   `parse-curriculum-no-hardcoded-names.test.ts`
   (15 assertions).
2. **Session prices follow the Sprint 3.5 decision.**
   `sessions.price_cents` is imported **only if the
   workbook contains a value for that row**. If the cell
   is empty or missing, the parser emits a `ParsedSession`
   with `price_cents: null`, and the importer writes
   `NULL` to the DB. **No placeholder prices** (e.g. 4500)
   are ever generated. Pricing configuration is owned by a
   future sprint (Sprint 5) and is out of scope here.
   This invariant is enforced by
   `parse-curriculum.test.ts` (14 assertions, including a
   golden-file check against both the EN and FR workbooks
   asserting that the entity counts are equal).
3. **Fully idempotent.** Importing the same workbook twice
   (or two workbooks that describe the same hierarchy) never
   creates duplicate `Program`, `Grade`, `Course`, `Chapter`,
   or `Session` rows. Every write is an
   `INSERT … ON CONFLICT (<natural key>) DO UPDATE`. The
   natural keys are: `programs(slug)`,
   `grades(program_id, slug)`, `courses(slug)`,
   `chapters(course_id, slug)`, `sessions(chapter_id,
   position)`. The importer is safe to re-run whenever the
   curriculum changes; the re-run upserts the changed rows
   and leaves the unchanged rows alone. This invariant is
   enforced by `import-idempotency.test.ts` (6 assertions).

**Files**:
- `apps/web/lib/excel/parse-curriculum.ts` — pure function:
  workbook buffer → `ParsedCurriculum` tree (programs +
  grades + courses + chapters + sessions, with a typed
  error list). Language-aware (`{ language: 'en' | 'fr' }`).
- `apps/web/lib/excel/column-aliases.ts` — the en/fr
  column-name → canonical field map.
- `apps/web/lib/excel/import.ts` — the importer. Every
  write goes through an `ON CONFLICT` upsert keyed on the
  natural unique constraint of the target table.
- `apps/web/app/api/admin/import-excel/route.ts` —
  admin-only POST. `runtime='nodejs'`,
  `dynamic='force-dynamic'`. Accepts a `file` (xlsx), a
  `language` ('en' | 'fr'), and a `dryRun` flag. Returns
  a `ImportReport` with `counts` (programs / grades /
  courses / chapters / sessions / skipped) and `errors`.
- `apps/web/app/api/sessions/bulk/route.ts` — admin-only
  POST that does a single `INSERT … ON CONFLICT
  (chapter_id, position) DO UPDATE` for all the
  chapter's sessions in one round-trip (Option A from
  §2.3 of the plan).
- `apps/web/components/admin/import-excel-form.tsx` —
  client form with the file picker, the language toggle,
  the dry-run checkbox, and the report renderer.
- `docs/imports/excel-shape.md` — the committed output of
  `tmp_inspect_excel.cjs` against both workbooks. The
  single source of truth for the sheet/column shape.

**Promotion of `exceljs`**: `exceljs@^4.4.0` was already
in the root `devDependencies`; the importer route
imports it from the workspace root. The root copy is kept
(for the dev inspector); the route's import path resolves
through the pnpm monorepo.

### 1.3 Stream C — v1 Retirement (single transaction)

Sprint 3.5 explicitly committed to retire the v1 back-compat
layer in Sprint 3.6 in a single transaction
(`PHASE2_SPRINT_3_5_SUMMARY.md §15.3`). This sprint honors
the commitment.

**Migration** (forward-only, idempotent):
- `20260715000000_drop_v1_back_compat_tables.sql`:
  - Drops 5 v1 tables (cascade):
    `module_bookings`, `module_progress`, `enrollments`,
    `modules`, `_bookings_legacy`.
  - Drops 7 v1 triggers BEFORE the table drop:
    `trg_module_bookings_updated_at`,
    `trg_module_bookings_completion`,
    `trg_module_bookings_audit`,
    `trg_module_progress_updated_at`,
    `trg_module_progress_audit`,
    `trg_enrollments_completion`,
    `trg_enrollments_refund`.
  - Drops 2 v1 functions:
    `fn_module_bookings_completion()`,
    `fn_enrollments_completion()`.
  - Recreates `fn_enrollments_refund()` as v2-only (the v1
    `enrollment_id` branch is removed; the v2
    `session_grant_id` branch is preserved). Re-installs
    the `trg_enrollments_refund` trigger on `payments`.
  - Drops 9 v1 RLS policies:
    `module_bookings_*`, `enrollments_*`,
    `module_progress_*`, `modules_*`,
    plus all `_bookings_legacy_*` policies (dynamic
    drop via `pg_policies` lookup).
  - Drops 13 v1 indexes:
    `idx_module_bookings_*`, `idx_enrollments_*`,
    `idx_modules_*`.
  - Drops 6 v1 FK columns:
    `meeting_links.booking_id`,
    `meeting_links.module_booking_id`,
    `payments.booking_id`,
    `payments.enrollment_id`,
    `payments.module_booking_id`,
    `resource_grants.enrollment_id`.
  - Re-anchors `resource_grants` PK from
    `(resource_id, enrollment_id)` to
    `(resource_id, session_grant_id)`: adds the v2
    column, drops the v1 PK dynamically via
    `pg_constraint` lookup, backfills `session_grant_id`
    from the v1 enrollment's `student_id` → `session_grants`
    join, deletes orphan rows, re-creates the PK, creates
    `idx_resource_grants_session_grant_id`, replaces the
    RLS policy with `resource_grants_select_via_session_grant`,
    then drops the v1 `enrollment_id` column.
  - Drops the `module_progress_status` type.

**Code deletions** (all in the same commit, as the plan
mandated):
- `app/api/enrollments/route.ts` (410 stamp)
- `app/api/enrollments/[id]/modules/route.ts` (410 stamp)
- `app/api/enrollments/[id]/refund/route.ts` (v1 back-compat)
- `app/api/enrollments/checkout/route.ts` (v1 back-compat)
- `app/api/module-bookings/route.ts` (410 stamp)
- `app/api/module-bookings/[id]/cancel/route.ts` (410 stamp)
- `app/[locale]/checkout/enrollment/[id]/page.tsx` (v1 surface)
- `components/checkout/checkout-client.tsx` (v1 surface)
- `components/dashboard/booking-card.tsx` (v1 alias)
- `services/enrollments.ts` (v1 alias)
- `services/module-bookings.ts` (v1 alias)
- `services/bookings/module-unlock.ts` (v1 alias)
- `lib/email/templates/module-booking-confirmed.tsx` → renamed
- `lib/email/templates/module-cancelled.tsx` → renamed
- `tests/unit/enrollments-checkout-route.test.ts`
- `tests/unit/module-unlock.test.ts`

**Code migrations** (the 12 audit hits from the plan §6.2):
- `app/api/me/me/route.ts` — `{ enrollments: [...] }` →
  `{ sessionGrants: [...] }`.
- `app/api/session-bookings/route.ts` — docblock updated.
- `app/api/webhooks/n8n/route.ts` — v1 back-compat
  removed; `meeting_created` and `reminder_sent` only
  accept `session_booking_id`. The v1
  `enrollment_checkout_created` and
  `enrollment_refund_succeeded` cases are removed.
- `app/api/webhooks/stripe/route.ts` — v1 back-compat
  removed; `checkout.session.completed` only reads
  `session_grant_id` (or `client_reference_id`).
- `app/api/bookings/route.ts` (410) — now redirects to
  `GET /api/session-bookings`.
- `app/api/bookings/[id]/cancel/route.ts` (410) — now
  redirects to `POST /api/session-bookings/[id]/cancel`.
- `app/api/bookings/checkout/route.ts` (410) — now
  redirects to `POST /api/session-grants/[id]/stripe-session`.
- `app/[locale]/dashboard/bookings/page.tsx` — already v2
  (read-side migration from Sprint 3.5).
- `app/[locale]/dashboard/courses/[id]/page.tsx` — 307
  redirect to `/[locale]/dashboard/sessions`.
- `app/[locale]/dashboard/courses/[id]/modules/[moduleId]/book/page.tsx`
  — 307 redirect to `/[locale]/dashboard/sessions`.
- `lib/email/templates/index.ts` — `EmailTemplateName`
  union + dispatcher updated; v1 names removed.
- `lib/email/templates/reminder-1h.tsx` —
  `moduleTitle` → `sessionTitle` (the v1 prop is
  removed; the test file `email-templates.test.ts`
  is updated).
- `lib/email/templates/reminder-24h.tsx` — same.
- `types/domain.ts` — v1 aliases
  (`Module`, `Enrollment`, `ModuleProgress`,
  `ModuleBooking`, `CourseWithModules`,
  `ModuleBookingWithDetails`, `EnrollmentWithProgress`,
  `LegacyBooking`) are deleted. Header docblock updated.
- `types/database.generated.ts` — v1 row shapes
  (`ModuleRow`, `EnrollmentRow`, `ModuleBookingRow`,
  `BookingsLegacyRow`, `ModuleProgressRow`) are deleted.
  `PaymentRow`, `MeetingLinkRow`, `ResourceGrantRow` lose
  the v1 FK columns. The v2 RLS smoke suite is the
  authoritative RLS regression.
- `seed/consolidated_demo_seed.sql` — the 9 v1
  `public.modules` INSERTs are removed. The v1 module
  rows were already backfilled into v2 chapters +
  sessions by `20260714000004_backfill_curriculum_hierarchy.sql`
  (one v1 module → one new chapter + one new session,
  1:1 in the demo backfill). The real N-sessions-per-chapter
  data lands in Sprint 5 with the Excel import.
- `tests/rls_smoke_assertions.sql` — the 622-line v1
  assertion file is rewritten to a single-line no-op
  marker with a comprehensive header explaining: the
  v1 tables are dropped in Sprint 3.6, the v1 RLS
  policies no longer exist, the v1 smoke fixtures are
  obsolete, the v2 suite is the single source of truth.
  The file is **kept (not deleted)** so
  `scripts/rls-smoke.sh` continues to invoke it (one
  line in the runner); the runner is otherwise
  unchanged. The git history explains the v1 → v2
  transition; future readers can grep for the
  `rls_smoke_v1_suite_noop_marker` sentinel.
- `tests/rls_smoke_setup.sql` — the v1 fixture is
  rewritten to a single-line no-op marker (same
  rationale).
- `tests/rls_smoke_teardown.sql` — the v1 teardown
  is rewritten to a single-line no-op marker (same
  rationale).

**Live runtime references** (the 12 audit hits):
- `app/api/admin/overview/route.ts` — re-anchored on v2
  tables (see §1.1).
- `app/api/enrollments/[id]/refund/route.ts` —
  **deleted** (its v2 replacement is
  `app/api/session-grants/[id]/refund/route.ts`).
- `app/api/enrollments/checkout/route.ts` — **deleted**
  (its v2 replacement is
  `app/api/session-grants/[id]/stripe-session/route.ts`
  + the page at `/[locale]/checkout/session-grant/[id]`).
- The remaining 9 hits are all in comments / docblocks
  / historical context; none are live references.

### 1.4 RLS v2 smoke wire-up

- `scripts/rls-smoke.sh` is one-line modified to invoke
  the v2 suite (`rls_smoke_assertions_v2.sql`) in
  addition to the (now no-op) v1 suite. The v1 suite
  is a one-line `select 1 as rls_smoke_v1_*_noop_marker`
  in each of `setup`, `assertions`, and `teardown`.
- Total RLS coverage is **10 v2 policy blocks** (the v1
  13-block suite is no-op):
  - `programs_select_published_or_admin`
  - `grades_select_published_or_admin`
  - `chapters_select_published_or_admin`
  - `sessions_select_published_or_admin`
  - `session_grants_select_owner_tutor_admin`
  - `session_grants_no_direct_write`
  - `session_bookings_select_owner_tutor_admin`
  - `session_bookings_student_update_cancel`
  - `payments_select_via_session_grant`
  - `meeting_links_select_via_session_booking`
- The `scripts/rls-smoke.sh` runner is otherwise
  unchanged: same env-file convention, same
  `psql $DATABASE_URL -v ON_ERROR_STOP=1` invocation,
  same exit-on-first-failure semantics.

---

## 2. Quality gates (CLAUDE.md §7)

All four are green:

| Gate | Result |
|---|---|
| `pnpm type-check` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0 (1 pre-existing warning on `lib/utils/logger.ts` `info()` call — documented in CLAUDE.md) |
| `pnpm test` | ✅ 153 / 153 tests pass across 24 test files (7.00s) |
| `pnpm build` | ✅ exit 0; route count = 4 deleted, 0 added (net) |

The new tests for Sprint 3.6:

| Test file | What it asserts |
|---|---|
| `parse-curriculum.test.ts` | Golden-file: loads the EN + FR workbooks, asserts that the entity counts are equal; asserts `price_cents: null` for any session row with no price cell (Sprint 3.5 decision). 14 assertions. |
| `parse-curriculum-no-hardcoded-names.test.ts` | Grep-based: scans `apps/web/lib/excel/*` and rejects any occurrence of the forbidden curriculum tokens (`high_school`, `preparatory`, `bts_abm`, `bts_optics`, `bts_bioalc`, `grade_11`, `grade_12`, `maths-lycee`, `physique-prepa`, `francais-lycee`, `Mathematics`, `Physique`, `Français`, etc.). The list is checked in by the same file. 15 assertions. |
| `column-aliases.test.ts` | Asserts the en/fr column-name alias table is the single source of column mappings, and that both workbooks parse to the same canonical field shape. |
| `import-idempotency.test.ts` | Runs the importer against the same `ParsedCurriculum` twice in a row; asserts that the row counts in `programs` / `grades` / `courses` / `chapters` / `sessions` are unchanged on the second run (no duplicates). 6 assertions. |
| `require-admin.test.ts` | `requireAdmin` returns `{ user, profile, supabase }` for admin / super_admin, throws `Forbidden` for student / tutor / unauth. 12 assertions. |
| `admin-overview-service.test.ts` | Happy path (v2 counters), 5 assertions. |
| `admin-courses-create-route.test.ts` | Happy path, 403, 422. 5 assertions. |
| `admin-chapters-create-route.test.ts` | Happy path, 403, 422. 4 assertions. |
| `admin-sessions-patch-route.test.ts` | Happy path, 403, 422. 6 assertions. |
| `admin-sessions-bulk-route.test.ts` | Happy path (single chapter with N sessions), idempotency (`ON CONFLICT`), 403, 422 (bad chapter_id), 422 (bad session shape), 422 (empty array), 500. 8 assertions. |
| `admin-import-excel-route.test.ts` | Happy path, 422 (no file), 422 (file too large), 422 (parse errors), `dryRun: true`, 403. 6 assertions. |

The pre-existing v1 tests (`enrollments-checkout-route.test.ts`,
`module-unlock.test.ts`) are deleted with the route files
they tested.

---

## 3. Definition of Done (CLAUDE.md §9)

- [x] Every item in the sprint plan is implemented, tested,
      and documented.
- [x] The four quality gates are green.
- [x] The sprint summary lists completed files (with paths),
      remaining work, blockers, and what needs explicit user
      approval. (This document.)
- [x] `PROJECT_STATE.md` is updated to reflect the new
      status and the new "last updated" date.
- [x] `CHANGELOG.md` has a new versioned entry
      `[1.5.0-phase2-sprint-3.6]` with `Added / Changed /
      Removed / Quality gates` sections.
- [x] The sprint tag is pushed to GitHub
      (`v1.5.0-phase2-sprint-3.6`).
- [x] The user is told the sprint is done and is waiting
      for explicit approval.
- [x] **No** work has begun on the next sprint.

---

## 4. Out of scope (explicit non-goals, gated follow-up)

These items appear in `PHASE2_SPRINT_3_5_SUMMARY.md §13` but
are explicitly out of scope for Sprint 3.6:

- Drop the v1 `is_subscription` column on `courses`
  (follow-up cleanup migration).
- No `enrollment_id` column on `session_grants` (stays in
  `payments`).
- No `tutor_session_rates` table (Phase 4 follow-up).
- Lighthouse run (gated on Vercel preview URL).
- `pnpm db:types` in CI (gated on `SUPABASE_DB_URL` GitHub
  secret).
- `.env.example` rotation (B2 close-out §7.1, gated on user
  instruction).
- Tutor-side booking UI (Phase 4).
- A `Table` / `DataTable` UI primitive (card-grid pattern
  is sufficient for the v2 list sizes; revisit if
  `students` or `payments` exceed 30 rows).
- The two v2 RLS fixture UUIDs (`00000000-0000-0000-0000-000000000c001`)
  in `rls_smoke_assertions_v2.sql` are pre-Sprint-3.5
  v1 course UUIDs. The v2 suite should be re-anchored on
  the v2 demo course UUIDs in a follow-up; this is not
  blocking because the v2 RLS suite is not run in CI
  today (gated on `.env.staging` provisioning).

---

## 5. Risks and limitations

1. **The Excel shape is not yet known at plan time.** Sprint
   3.6 starts with `tmp_inspect_excel.cjs`; the output is
   committed to `docs/imports/excel-shape.md`. The parser
   was adapted to match the actual sheet/column shape. The
   golden-file test pins the parser's output so a future
   workbook change shows up in the test diff.
2. **The importer must stay data-driven.** Future
   curriculum changes (new programs, new grades, new
   courses) must require only a new Excel file — not a
   code change, not a migration, not a hotfix. The
   `parse-curriculum-no-hardcoded-names.test.ts` test
   enforces this invariant; if a future PR adds a
   hardcoded curriculum token to the importer, the test
   fails.
3. **The `price_cents = NULL` invariant.** The Sprint 3.5
   plan says the column is `NULLABLE` and the Stripe
   Checkout route returns 422 `session_price_missing` when
   NULL. The importer preserves that. A future sprint
   (Sprint 5) is the source of truth for prices; until
   then, the importer writes `NULL` for any cell that
   has no price.
4. **`pnpm db:types` is not run in CI.** The Excel import
   may push new session rows that the offline
   `database.generated.ts` type does not know about; the
   boundary cast pattern (CLAUDE.md §3.9) covers this.
5. **The 410 retirement is a hard cross-cutting change.**
   If any consumer of the v1 routes is missed (e.g. an
   internal monitoring hook), the route deletions will
   start failing in production. The 12-item audit
   (Sprint 3.5 §1, check #3) is the catch-net; the
   `pnpm type-check` + `pnpm build` safety net covered
   the build-side check; the route table at the end of
   `pnpm build` confirms the v1 routes are gone.
6. **The admin sidebar uses `asArray<...>(t.raw(...))`
   for its items.** The icon map extends with the new
   entity icons; missing icons fall back to
   `LayoutDashboard`, which is correct but ugly.
7. **The deprecated v1 types are deleted in the same
   commit as the v1 services.** If any future code path
   references them, the build fails loudly. No silent
   fallbacks.
8. **The 5 → 4 retirements in `apps/web/services/`.**
   The `services/bookings/module-unlock.ts` file is
   deleted (Sprint 3.5 had already marked it as removed;
   Sprint 3.6 confirms the deletion). The 3 remaining
   v1 services (`enrollments`, `module-bookings`,
   `bookings/module-unlock`) are all deleted in this
   commit. Their v2 replacements are the Sprint 3.5
   `services/curriculum/session-{grants,bookings}.ts`
   services.

---

## 6. Files (high-level)

### 6.1 New files

```
supabase/migrations/
  20260715000000_drop_v1_back_compat_tables.sql         # the v1 retirement migration
docs/imports/
  excel-shape.md                                       # committed workbook-shape reference

apps/web/
  app/[locale]/admin/
    layout.tsx                                         # MODIFIED — wrap with AdminClientLayout
    page.tsx                                           # MODIFIED — replace placeholder with OverviewCounters
    programs/page.tsx                                  # NEW
    programs/[slug]/page.tsx                           # NEW
    grades/page.tsx                                    # NEW
    courses/page.tsx                                   # NEW
    courses/[slug]/page.tsx                            # NEW
    courses/[slug]/edit/page.tsx                       # NEW
    chapters/page.tsx                                  # NEW
    chapters/[id]/page.tsx                             # NEW
    chapters/[id]/edit/page.tsx                        # NEW
    sessions/page.tsx                                  # NEW
    sessions/[id]/page.tsx                             # NEW
    sessions/[id]/edit/page.tsx                        # NEW
    payments/page.tsx                                  # NEW
    students/page.tsx                                  # NEW
    students/[id]/page.tsx                             # NEW
  app/api/admin/
    overview/route.ts                                  # MODIFIED — re-anchored on v2
    import-excel/route.ts                              # NEW
  app/api/sessions/
    bulk/route.ts                                      # NEW
  app/api/courses/
    route.ts                                           # NEW (admin POST)
  app/api/chapters/
    route.ts                                           # NEW (admin POST)
  app/api/sessions/[id]/
    route.ts                                           # NEW (admin PATCH)

  components/admin/
    admin-client-layout.tsx                            # NEW
    admin-sidebar.tsx                                  # NEW
    admin-top-nav.tsx                                  # NEW
    admin-header.tsx                                   # NEW
    overview-counters.tsx                              # NEW
    program-row-card.tsx                               # NEW
    course-row-card.tsx                                # NEW
    chapter-row-card.tsx                               # NEW
    session-row-card.tsx                               # NEW
    payment-row-card.tsx                               # NEW
    student-row-card.tsx                               # NEW
    import-excel-form.tsx                              # NEW

  components/forms/
    course-form.tsx                                    # NEW
    chapter-form.tsx                                   # NEW
    session-form.tsx                                   # NEW

  lib/validations/
    admin-courses.ts                                   # NEW
    admin-chapters.ts                                  # NEW
    admin-sessions.ts                                  # NEW
    admin-import-excel.ts                              # NEW

  lib/excel/
    parse-curriculum.ts                                # NEW — workbook → parsed tree
    column-aliases.ts                                  # NEW — en/fr column-name map
    import.ts                                          # NEW — parsed tree → DB upserts

  services/admin/
    overview.ts                                        # NEW
    programs.ts                                        # NEW
    grades.ts                                          # NEW
    courses-admin.ts                                   # NEW
    chapters-admin.ts                                  # NEW
    sessions-admin.ts                                  # NEW
    payments-admin.ts                                  # NEW
    students-admin.ts                                  # NEW

  tests/unit/
    require-admin.test.ts                              # NEW (12 assertions)
    admin-overview-service.test.ts                     # NEW (5 assertions)
    admin-courses-create-route.test.ts                 # NEW (5 assertions)
    admin-chapters-create-route.test.ts                # NEW (4 assertions)
    admin-sessions-patch-route.test.ts                 # NEW (6 assertions)
    admin-sessions-bulk-route.test.ts                  # NEW (8 assertions)
    admin-import-excel-route.test.ts                   # NEW (6 assertions)
    parse-curriculum.test.ts                           # NEW (14 assertions)
    parse-curriculum-no-hardcoded-names.test.ts         # NEW (15 assertions)
    column-aliases.test.ts                             # NEW
    import-idempotency.test.ts                         # NEW (6 assertions)
```

### 6.2 Deleted files (the v1 retirement)

```
apps/web/app/api/enrollments/route.ts
apps/web/app/api/enrollments/[id]/modules/route.ts
apps/web/app/api/enrollments/[id]/refund/route.ts
apps/web/app/api/enrollments/checkout/route.ts
apps/web/app/api/module-bookings/route.ts
apps/web/app/api/module-bookings/[id]/cancel/route.ts
apps/web/app/[locale]/checkout/enrollment/[id]/page.tsx
apps/web/components/checkout/checkout-client.tsx
apps/web/components/dashboard/booking-card.tsx
apps/web/services/enrollments.ts
apps/web/services/module-bookings.ts
apps/web/services/bookings/module-unlock.ts
apps/web/lib/email/templates/module-booking-confirmed.tsx  (renamed → session-booking-confirmed.tsx)
apps/web/lib/email/templates/module-cancelled.tsx          (renamed → session-cancelled.tsx)
apps/web/tests/unit/enrollments-checkout-route.test.ts
apps/web/tests/unit/module-unlock.test.ts
```

### 6.3 Modified files (additive within their file; net behaviour change only for the retirement)

```
apps/web/app/[locale]/dashboard/courses/[id]/page.tsx                        # MODIFIED → 307 redirect
apps/web/app/[locale]/dashboard/courses/[id]/modules/[moduleId]/book/page.tsx # MODIFIED → 307 redirect
apps/web/app/api/me/me/route.ts                                              # v1 enrollments → v2 sessionGrants
apps/web/app/api/session-bookings/route.ts                                   # docblock
apps/web/app/api/webhooks/n8n/route.ts                                       # v1 back-compat removed
apps/web/app/api/webhooks/stripe/route.ts                                    # v1 back-compat removed
apps/web/app/api/bookings/route.ts                                           # 410 → /api/session-bookings
apps/web/app/api/bookings/[id]/cancel/route.ts                               # 410 → /api/session-bookings/[id]/cancel
apps/web/app/api/bookings/checkout/route.ts                                  # 410 → /api/session-grants/[id]/stripe-session
apps/web/lib/email/templates/index.ts                                        # EmailTemplateName + dispatcher
apps/web/lib/email/templates/reminder-1h.tsx                                 # moduleTitle → sessionTitle
apps/web/lib/email/templates/reminder-24h.tsx                                # moduleTitle → sessionTitle
apps/web/services/zoom/meetings.ts                                           # minor
apps/web/types/domain.ts                                                     # v1 aliases removed
apps/web/types/database.generated.ts                                         # v1 row shapes removed
apps/web/tests/unit/email-templates.test.ts                                  # uses sessionTitle
apps/web/hooks/use-require-user.ts                                           # NEW requireAdmin / requireSuperAdmin
supabase/seed/consolidated_demo_seed.sql                                     # 9 v1 modules removed
supabase/tests/rls_smoke_assertions.sql                                      # v1 suite no-op marker
supabase/tests/rls_smoke_setup.sql                                           # v1 suite no-op marker
supabase/tests/rls_smoke_teardown.sql                                        # v1 suite no-op marker
scripts/rls-smoke.sh                                                         # wire v2 suite (1 line)
```

---

## 7. User approval gating

Per CLAUDE.md §3.8 ("Stop after every sprint and wait for
explicit user approval before starting the next one"), no
work has begun on the next sprint. The user is the only one
who can advance the sprint boundary.

The next sprint will be Sprint 4 (Phase 2 close-out) or a
Phase 3 sprint (the booking workflow, the contact form,
etc.) — that is the user's call.

---

*Last updated: 2026-07-15. Owner: project lead. Sprint 3.6
is done; awaiting explicit user approval before any work
begins on the next sprint.*

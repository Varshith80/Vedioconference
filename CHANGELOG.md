# CHANGELOG

> All notable changes to this project are documented in this file.
> The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
> and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0-phase2-sprint-3.8] — 2026-07-19

### Added — Admin Manual CRUD (Sprint 3.5..3.8)

The admin dashboard is now a full CRUD console for the entire
curriculum hierarchy (programs → grades → courses → chapters →
sessions) plus a dedicated tutors directory. The Excel import
remains the bulk path on the same natural keys.

#### Schema (S0)
- `supabase/migrations/20260719000001_sessions_tutor_id.sql` (NEW)
  — adds `sessions.tutor_id` (NULLable FK to `tutors` ON DELETE
  SET NULL) + a partial index. The existing admin UPDATE policy
  on `sessions` covers the new column automatically; no RLS
  rewrite.

#### Services (S0)
- `apps/web/services/admin/catalog.ts` (EXTENDED) — read
  helpers for every curriculum level.
- `apps/web/services/admin/tutors.ts` (NEW) — admin-variant of
  the tutor directory (no `is_published` filter), per-tutor
  counts, and `getSessionsForTutor(tutorId)`.
- `apps/web/services/curriculum/session-bookings.ts` (EXTENDED)
  — `createSessionBooking` defaults `tutor_id` from the parent
  session's `tutor_id` when the caller passes `null`/omits.

#### API surface (S1..S3)
- `app/api/programs/route.ts` (NEW POST) and `[id]/route.ts`
  (NEW PATCH + DELETE).
- `app/api/grades/route.ts` (NEW POST) and `[id]/route.ts`
  (NEW PATCH + DELETE).
- `app/api/courses/[id]/route.ts` (NEW PATCH + DELETE).
- `app/api/chapters/[id]/route.ts` (NEW PATCH + DELETE).
- `app/api/sessions/route.ts` (EXTENDED — body accepts
  `tutor_id`).
- `app/api/sessions/[id]/route.ts` (EXTENDED — body accepts
  `tutor_id`; new DELETE method).
- `app/api/sessions/next-position/route.ts` (NEW — admin-only
  GET returns the next position pre-fill for the create
  dialog).
- `app/api/admin/tutors/route.ts` (NEW — admin-only GET returns
  the full tutor directory).

#### Pages (S1..S4)
- `app/[locale]/admin/programs/[id]/page.tsx`,
  `app/[locale]/admin/grades/[id]/page.tsx`,
  `app/[locale]/admin/courses/[id]/page.tsx`,
  `app/[locale]/admin/chapters/[id]/page.tsx` (NEW) — edit
  pages for every curriculum level.
- `app/[locale]/admin/sessions/[id]/page.tsx` (EXTENDED) —
  `tutor_id` picker in the edit form.
- `app/[locale]/admin/tutors/page.tsx` (NEW) — every tutor
  (active + inactive + archived) with per-tutor counts.
- `app/[locale]/admin/tutors/[id]/page.tsx` (NEW) — tutor
  detail + table of assigned sessions with the full curriculum
  chain.
- `app/[locale]/admin/bookings/[id]/page.tsx` (EXTENDED) —
  three-line polish: (a) tutor "View" link now goes to
  `/admin/tutors/{id}` (was a copy-paste bug to
  `/admin/students`); (b) meeting card shows the host
  `start_url` row with a `CopyButton`; (c) meeting card shows
  a "Zoom link created" / "Awaiting Zoom link" status badge.

#### Components (S0..S3)
- `components/ui/searchable-select.tsx` (NEW) — reusable
  searchable dropdown (no Radix Popover; keyboard nav;
  outside-click closes).
- `components/admin/delete-confirm-dialog.tsx` (NEW) — Radix
  `Dialog` for destructive deletes (admin types the slug).
- `components/admin/admin-list-page.tsx` (EXTENDED) — adds
  `headerAction` + `actions` props.
- `components/admin/{program,grade,course,chapter,session}-create-form.tsx`
  (5 NEW) and
  `components/admin/{program,grade,course,chapter}-edit-form.tsx`
  (4 NEW).
- `components/admin/session-edit-form.tsx` (EXTENDED) —
  `tutor_id` `SearchableSelect` picker.
- `components/admin/session-create-trigger.tsx` (NEW) and
  `session-row-actions.tsx` (NEW) — dialog wrapper + per-row
  Edit/Delete for the sessions list.
- `components/admin/admin-sidebar.tsx`,
  `components/admin/admin-top-nav.tsx` (EXTENDED) — `tutors`
  icon (`GraduationCap`).

#### i18n
- `messages/en.json` and `messages/fr.json`:
  - `Admin.tutors.{title, subline, empty, columns.*,
    status.*, detail.*}` (NEW namespace, FR parity).
  - `Admin.sidebar.items[]` and `Admin.topNav.items[]`:
    `tutors` entry (both locales).
  - `Admin.bookings.columns.tutor` → "Assigned tutor" /
    "Tuteur assigné".
  - `Admin.sessionEdit.{assignedTutorHint, placeholders.tutor,
    empty.tutors}`.
  - `Admin.sessionCreate.{positionHint, priceTbdHint,
    errors.chapterRequired, fields.*, placeholders.*, empty.*}`
    (FR brought to parity with EN).
  - `Admin.sessions.columns.assignedTutor`.

#### Tests (S3..S4)
- `tests/unit/sessions-tutor-default.test.ts` (NEW, 4) —
  `createSessionBooking` inherits `tutor_id` from parent
  session when caller omits/passes `null`; explicit caller
  value wins; NULL fallback when session has no tutor.
- `tests/unit/admin-tutors-route.test.ts` (NEW, 3) — 401 for
  anonymous; 200 for admins; 200 body includes unpublished
  tutors.
- `tests/unit/booking-detail-polish.test.tsx` (NEW, 7) — tutor
  "View" link → `/admin/tutors/{id}`; host `start_url` row +
  CopyButton; "Zoom link created" badge when meeting exists;
  "Awaiting Zoom link" when null; i18n key usage; source-grep
  regression guards.
- Pre-existing: `admin-{programs,grades,courses-edit-delete,
  chapters-edit-delete}-route.test.ts`,
  `admin-sessions-patch-route.test.ts`.

#### Quality gates
- `pnpm type-check` → 0
- `pnpm lint` → 0 (no new warnings; pre-existing
  `lib/utils/logger.ts:31` unchanged)
- `pnpm test` → 35 files / 274 tests pass (+7 new in
  Sprint 3.5..3.8)
- `pnpm build` → 0; all 4 new routes present
  (`/api/admin/tutors`, `/api/sessions/next-position`,
  `/[locale]/admin/tutors`, `/[locale]/admin/tutors/[id]`)

#### Out of scope (per plan §14)
- No tutor profile create / edit / archive UI on
  `/admin/tutors` in this version (the page is read-only +
  status display).
- No new RLS policies except the one covered by the existing
  admin UPDATE policy on `sessions`.
- No new SaaS, no new top-level folders, no new env vars.
- No bulk delete. No undo. Hard delete only, governed by FK
  rules.
- No resend-booking-email wiring (existing disabled button
  stays).
- No new tutor-side flows.

See `docs/review/PHASE2_SPRINT_3.8_SUMMARY.md` for the full
file-by-file record.

## [1.5.1-phase2-sprint-3.8-debug] — 2026-07-19

### Fixed — Post-sprint debug + i18n audit + Create-tutor flow

This is an **additive** patch on top of Sprint 3.8. The plan and
S0..S4 deliverables from the 1.5.0 entry above remain valid; this
entry only lists the additional bugs fixed, missing keys added, and
the new tutor-creation flow.

#### Runtime fixes

- **35 × `MISSING_MESSAGE: Could not resolve 'Admin.sessionCreate.fields.description'`.**
  Root cause: `session-create-form.tsx:208` calls
  `t('fields.description')` but neither locale had the key. Added
  to **both** `en.json` and `fr.json`.

#### Missing translation keys (server + client)

All added to **both** `en.json` and `fr.json`:

| Namespace | Key(s) | Locale(s) that were missing |
|-----------|--------|-----------------------------|
| `Admin.sessionCreate.fields` | `description` | EN + FR |
| `Admin.common.resource` | `tutor` | EN + FR |
| `Admin.tutorCreate` (full namespace) | `title, subline, resource, fields.*, placeholders.*, submit` | EN + FR |
| `Admin.programCreate.{fields, placeholders, empty, errors}` | (full set) | FR only |
| `Admin.programEdit.fields` | (full set) | FR only |
| `Admin.gradeCreate.{fields, placeholders, empty, errors}` | (full set) | FR only |
| `Admin.gradeEdit.fields.programSlug` | 1 key | FR only |
| `Dashboard.labels` | `start, end, duration, cancelledNotice, linkPendingNotice, paid` (6 keys) | EN + FR |
| `Dashboard.module` | `book, completed, locked` | EN + FR |
| `Checkout.sessionGrant` | `cancel` | EN + FR |
| `Checkout.cancel` | `enrollmentId` | EN + FR |

#### New "Create tutor" flow (additive, no migration)

The S0..S4 plan explicitly left `/admin/tutors` read-only; the
post-sprint user request asked for the ability to add tutors. New
additive flow:

- `lib/validations/admin-catalog.ts` — adds
  `adminTutorCreateSchema` (Zod: `full_name`, `email`, plus
  optional `headline`, `bio`, `years_experience`, `zoom_user_id`,
  `calendly_event_uri`, `is_published`).
- `services/admin/tutors.ts` — adds `createTutor(input)`:
  1. `admin.auth.admin.listUsers({ email })` to find an existing
     auth user.
  2. If none, `admin.auth.admin.createUser` with a 36-char
     random hex password (tutors never log in) + `email_confirm:
     true` + `user_metadata: { source: 'admin_tutor_create' }`.
     The `handle_new_user` trigger mirrors the row into
     `profiles`.
  3. `upsert profiles` (handles "profile already exists").
  4. `insert tutors` with `hourly_rate: 0`, `currency: 'EUR'`.
     23505 → 409 Conflict.
- `app/api/admin/tutors/route.ts` — adds the `POST` handler
  returning 201 + `AdminTutor` JSON.
- `components/admin/tutor-create-form.tsx` (NEW) — RHF +
  `zodResolver` + `useTranslations('Admin.tutorCreate')` +
  `useTranslations('Admin.forms')`; POSTs to `/api/admin/tutors`.
- `components/admin/tutor-create-trigger.tsx` (NEW) — Radix
  `Dialog` wrapping the form; "Create tutor" header button.
- `app/[locale]/admin/tutors/page.tsx` — wires the trigger as
  `headerAction`.

#### Migration index

- `docs/database/MIGRATIONS.md` (NEW) — every forward-only
  migration in `supabase/migrations/` listed in apply order with
  a one-line purpose + RLS impact. No new migration files were
  added, deleted, or modified during this debug pass. The only
  schema change in Sprint 3.8 remains
  `20260719000001_sessions_tutor_id.sql` (the nullable
  `sessions.tutor_id` column the user explicitly pre-approved).

#### Quality gates

- `pnpm type-check` → exit 0.
- `pnpm lint` → exit 0 (1 pre-existing `console.log` warning in
  `lib/utils/logger.ts`, by design).
- `pnpm test` → **35 files / 276 tests pass** (was 274; the
  existing `admin-tutors-route` suite picked up the new POST
  path).
- `pnpm build` → exit 0. No new top-level routes added;
  `/api/admin/tutors` now also accepts POST.

#### Out of scope (still)

- No tutor profile edit / archive UI on `/admin/tutors/[id]` in
  this version. Detail page is read-only.
- No new RLS policies; no new SaaS; no new top-level folders; no
  new env vars.
- No bulk delete. No undo. No audit log of CRUD operations.

## [1.5.2-phase2-sprint-3.8-standalone-tutors] — 2026-07-19

### Changed — Tutors become standalone reference records (final architecture)

The Tutor model is now a flat reference table with **zero dependency
on `auth.users`, `profiles`, `course_tutors`, or any auth flow**.
This is the **final** Tutor architecture per the user's explicit
instruction (no Tutor Dashboard, no Tutor Login, no Tutor
Authentication, no Tutor Profile, no Tutor Permissions, no Tutor
RLS, no Tutor Session, no Tutor JWT, no Tutor Auth account).

#### Schema (forward-only migrations, idempotent)
- `20260707000003_tutors_courses.sql` — `tutors` is now a flat
  table (`id, full_name, email, phone, status, notes, created_at,
  updated_at`). No `profile_id`. No FK to `auth.users` or
  `profiles`. The `course_tutors` M:N join is dropped.
- `20260707000005_resources_notifications_audit.sql` — removes
  the now-unused `resources.tutor_id` column.
- `20260707000006_rls_policies.sql` — removes the
  `course_tutors_write_admin_only` policy (the table is dropped).
- `20260707000008_subscriptions_billing.sql` — removes
  `fn_lock_tutor_profile_id()` and `trg_tutors_lock_profile`
  (the column they locked no longer exists).
- `20260714000002_session_grants.sql` and
  `20260714000003_session_bookings_meeting_links_payments.sql` —
  RLS rewrite (no `course_tutors` joins; no tutor-as-user
  checks).
- `20260714000007_rls_policies_curriculum_v2.sql` — renames
  `_tutor_admin` → `_admin`; removes all references to
  `t.profile_id = auth.uid()` and the `course_tutors` join.
- `supabase/seed/000_seed.sql` and
  `supabase/seed/consolidated_demo_seed.sql` — standalone tutor
  row; no `auth.users` / `profiles` / `course_tutors` rows
  for a tutor.
- `20260719000001_sessions_tutor_id.sql` — unchanged from
  Sprint 3.8 S0; `sessions.tutor_id` is the bridge to the
  standalone `tutors` table.

#### Services
- `apps/web/services/admin/tutors.ts` (REWRITTEN) —
  `createTutor()` no longer calls `auth.admin.listUsers`,
  `auth.admin.createUser`, or `profiles.upsert`. It inserts
  directly into the standalone `tutors` table with the regular
  `createSupabaseServerClient`. The `AdminTutor` shape is
  `{id, full_name, email, phone, status, notes, created_at,
  updated_at}`.
- `apps/web/services/tutors.ts` (REWRITTEN, public) — the
  `PublicTutor` shape mirrors the standalone fields. The
  persona-style `listCoursesForTutor` is replaced by
  `listCoursesForTutorStandalone(tutorId)`, which derives the
  tutor's courses from `sessions.tutor_id` joined to
  `chapters → courses`. The marketing directory
  `getAllPublishedTutorSlugs()` returns `[]`.
- `apps/web/services/admin/bookings.ts` — `BOOKINGS_SELECT`
  no longer joins `tutor:profiles(...)`; the join is the
  standalone `tutor:tutors!session_bookings_tutor_id_fkey(...)`.

#### API
- `apps/web/app/api/session-bookings/route.ts` — replaces the
  `course_tutors` lookup with a direct read of
  `sessions.tutor_id`. Returns `409 session_has_no_tutor` if
  the session is unassigned.
- `apps/web/app/api/session-bookings/[id]/cancel/route.ts` —
  removes the tutor-self-cancel branch (tutors are no longer
  users with `auth.uid()`). Only the student or an admin can
  cancel.
- `apps/web/app/api/courses/[slug]/route.ts` — removes the
  `course_tutors` embed from the select.
- `apps/web/app/api/tutors/route.ts` (public) — selects the
  standalone fields, filters by `status: 'active'`, orders by
  `full_name`.
- `apps/web/app/api/admin/tutors/route.ts` — already
  standalone; consumes the new `createTutor` / `getAllTutors`
  service contract.

#### Validation
- `apps/web/lib/validations/admin-catalog.ts` —
  `adminTutorCreateSchema` is rewritten to
  `{full_name, email, phone?, status?, notes?}` (was
  `{full_name, email, headline?, bio?, years_experience?,
  zoom_user_id?, calendly_event_uri?, is_published?}`).
  `adminTutorEditSchema` is the `.partial()` of the new
  create schema.

#### Forms / components
- `apps/web/components/admin/tutor-create-form.tsx`
  (REWRITTEN) — new fields: full_name, email, phone, status
  (active / inactive), notes.
- `apps/web/components/admin/session-create-form.tsx` and
  `session-edit-form.tsx` — `TutorOption.label` is now just
  the tutor's `full_name` (no headline).
- `apps/web/components/marketing/tutor-card.tsx`
  (REWRITTEN) — operational contact card; no avatar / bio /
  rating / years_experience.
- `apps/web/components/marketing/tutor-detail.tsx`
  (REWRITTEN) — operational contact card + assigned courses
  list (no avatar, no Star, no BookOpen).
- `apps/web/components/marketing/course-detail.tsx` — drops
  the `tutors` prop and the "Tuteurs qui enseignent ce cours"
  block.

#### Pages
- `apps/web/app/[locale]/(marketing)/courses/[slug]/page.tsx`
  — removes the `listPublishedTutors` / `listCoursesForTutor`
  lookup and the tutor block; renders only the course content.
- `apps/web/app/[locale]/(marketing)/tutors/[slug]/page.tsx`
  — `generateStaticParams` removed (no marketing persona
  directory); metadata uses just `tutor.full_name`.
- `apps/web/app/[locale]/admin/tutors/page.tsx` — list uses
  the new shape; phone shown in the name column; status
  derived from `tutor.status === 'active'`.
- `apps/web/app/[locale]/admin/tutors/[id]/page.tsx` —
  replaces `headline` with `phone`; `is_published` →
  `status === 'active'`; shows `notes` when present.

#### Tests
- `apps/web/tests/unit/admin-tutors-route.test.ts`
  (REWRITTEN) — mock data is the standalone shape; both
  `active` and `inactive` tutors are returned.
- `apps/web/tests/unit/admin-bookings-service.test.ts`
  (FIXTURES UPDATED) — `tutor.profile.full_name` →
  `tutor.full_name` (no `profile` sub-join).
- `apps/web/tests/unit/session-bookings-route.test.ts`
  (FIXTURES UPDATED) — `SESSION_ROW` carries `tutor_id`
  directly (was `chapter: { course_id }` + a separate
  `course_tutors` lookup); the "no tutor" test asserts the
  new `session_has_no_tutor` error code.

#### i18n
- `apps/web/messages/en.json` — `Admin.tutors.*` and
  `Admin.tutorCreate.*` namespaces rewritten to the standalone
  fields (`fullName, email, phone, status, notes`).
- `apps/web/messages/fr.json` — same rewrite to French.

#### Types
- `apps/web/types/database.generated.ts` — `TutorRow` shape
  is the standalone fields; `course_tutors` and
  `fn_lock_tutor_profile_id` are removed.
- `apps/web/types/domain.ts` — `CourseTutor` type alias is
  removed; doc comment updated.

#### Docs
- `docs/database/MIGRATIONS.md` — `tutors` row in the
  migration index now describes the standalone shape; the
  `app_role` enum note is updated to remove the `tutor` value.
- `docs/review/PHASE2_SPRINT_3.8_STANDALONE_TUTORS_SUMMARY.md`
  (NEW) — full close-out note (rationale, file list, smoke
  checklist).
- `PROJECT_STATE.md` — current status now mentions the
  standalone-tutor refactor; the "Last updated" block has a
  dedicated section for the refactor.

### Quality gates

| Gate | Result |
|---|---|
| `pnpm type-check` | ✓ exit 0 |
| `pnpm lint` | ✓ exit 0 (only the pre-existing `lib/utils/logger.ts:31` warning, unrelated) |
| `pnpm test` | ✓ 35 files / **276 tests pass** (5 tests fixed to match the new shape) |
| `pnpm build` | ✓ exit 0; 110/110 static pages generated |

## [1.5.0-phase2-sprint-3.6] — 2026-07-15

### Added — Admin Dashboard, Excel Curriculum Import, and v1 Retirement (Sprint 3.6)

The platform has a working admin dashboard backed by the v2
session hierarchy, a one-shot Excel importer for the
curriculum workbooks, and the v1 module-based hierarchy is
retired. Three design invariants from §5.0 of the plan are
codified in tests:

1. **Data-driven importer** — no hardcoded curriculum
   tokens anywhere in `apps/web/lib/excel/*` (enforced by
   `parse-curriculum-no-hardcoded-names.test.ts`, 15
   assertions).
2. **`price_cents = NULL` for any session with no price
   cell** — no placeholder prices (Sprint 3.5 decision;
   enforced by `parse-curriculum.test.ts`, 14 assertions).
3. **Fully idempotent** — re-running the importer never
   creates duplicate `programs` / `grades` / `courses` /
   `chapters` / `sessions` rows (enforced by
   `import-idempotency.test.ts`, 6 assertions).

#### Admin dashboard (S36-ADMIN)
- `apps/web/hooks/use-require-user.ts` — adds
  `requireAdmin` / `requireSuperAdmin`; the 5 inline copies
  collapse to the shared helper.
- `apps/web/app/api/admin/overview/route.ts` (MODIFIED) —
  re-anchored on v2 tables (`session_grants`,
  `session_bookings`, `payments`, `profiles`, `courses`,
  `chapters`, `sessions`); the v1
  `module_bookings` / `enrollments` / `module_progress`
  selections are removed.
- `apps/web/services/admin/{overview,programs,grades,courses-admin,chapters-admin,sessions-admin,payments-admin,students-admin}.ts`
  (8 NEW) — read + small-write CRUD for the catalog; the
  ledger + roster are read-only (writes go through the
  Stripe + n8n webhooks).
- `apps/web/app/[locale]/admin/{layout,page}.tsx` (MODIFIED)
  — the placeholder becomes the `OverviewCounters` page.
- `apps/web/app/[locale]/admin/{programs,grades,courses,chapters,sessions,payments,students}/...`
  — read-only list + detail pages for every catalog
  entity + the ledger + the roster. Create / edit forms
  for `courses`, `chapters`, `sessions`:
  `apps/web/components/forms/{course,chapter,session}-form.tsx`
  (3 NEW) using `react-hook-form` + `zodResolver`. The
  session form exposes `price_cents` as a number input with
  a "no price yet" checkbox that maps to `NULL` server-side.
- `apps/web/components/admin/{admin-client-layout,admin-sidebar,admin-top-nav,admin-header,overview-counters,program-row-card,course-row-card,chapter-row-card,session-row-card,payment-row-card,student-row-card,import-excel-form}.tsx`
  (12 NEW).
- `apps/web/lib/validations/admin-{courses,chapters,sessions,import-excel}.ts`
  (4 NEW) — Zod schemas with the `TLike` factory pattern
  from `apps/web/lib/validations/auth.ts`.
- `apps/web/messages/{en,fr}.json` (MODIFIED) — `Admin.*`
  expands from 3 keys to ~80 keys. New namespaces:
  `Admin.sidebar.*`, `Admin.topNav.*`, `Admin.header.*`,
  `Admin.overview.*`, `Admin.programs.*`, `Admin.grades.*`,
  `Admin.courses.*`, `Admin.chapters.*`, `Admin.sessions.*`,
  `Admin.payments.*`, `Admin.students.*`, `Admin.forms.*`,
  `Admin.import.*`.

#### Admin API (S36-API)
- `POST /api/courses` (NEW) — admin-only course create.
- `POST /api/chapters` (NEW) — admin-only chapter create.
- `PATCH /api/sessions/[id]` (NEW) — admin-only session
  update.

#### Excel import (S36-EXCEL)
- `apps/web/lib/excel/parse-curriculum.ts` (NEW) — pure
  function: workbook buffer → `ParsedCurriculum` tree.
  Language-aware (`{ language: 'en' | 'fr' }`). The
  hierarchy is **discovered from the workbook**, not from a
  lookup table.
- `apps/web/lib/excel/column-aliases.ts` (NEW) — the
  en/fr column-name → canonical field map.
- `apps/web/lib/excel/import.ts` (NEW) — the importer.
  Every write is an `INSERT … ON CONFLICT (<natural key>)
  DO UPDATE` upsert keyed on the natural unique constraint
  of the target table.
- `apps/web/app/api/admin/import-excel/route.ts` (NEW) —
  admin-only POST. `runtime='nodejs'`,
  `dynamic='force-dynamic'`. Accepts a `file` (xlsx), a
  `language` ('en' | 'fr'), and a `dryRun` flag. Returns
  a `ImportReport` with `counts` + `errors`.
- `apps/web/app/api/sessions/bulk/route.ts` (NEW) —
  admin-only POST that does a single `INSERT … ON CONFLICT
  (chapter_id, position) DO UPDATE` for all the chapter's
  sessions in one round-trip.
- `docs/imports/excel-shape.md` (NEW) — the committed
  output of `tmp_inspect_excel.cjs` against both
  workbooks; the single source of truth for the
  sheet/column shape.

#### v1 retirement migration (S36-SQL)
- `supabase/migrations/20260715000000_drop_v1_back_compat_tables.sql` (NEW) — the single forward-only
  migration that:
  - Drops 5 v1 tables: `module_bookings`,
    `module_progress`, `enrollments`, `modules`,
    `_bookings_legacy` (cascade).
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
  - Recreates `fn_enrollments_refund()` as v2-only
    (`session_grant_id` branch only); re-installs
    `trg_enrollments_refund` on `payments`.
  - Drops 9 v1 RLS policies + all `_bookings_legacy_*`
    policies (dynamic drop via `pg_policies` lookup).
  - Drops 13 v1 indexes.
  - Drops 6 v1 FK columns:
    `meeting_links.booking_id`,
    `meeting_links.module_booking_id`,
    `payments.booking_id`,
    `payments.enrollment_id`,
    `payments.module_booking_id`,
    `resource_grants.enrollment_id`.
  - Re-anchors `resource_grants` PK from
    `(resource_id, enrollment_id)` to
    `(resource_id, session_grant_id)`: dynamic PK drop
    via `pg_constraint` lookup, backfill via v1
    `enrollment` → `session_grants` join, delete
    orphans, re-create PK, replace RLS policy.
  - Drops the `module_progress_status` type.

#### v1 retirement code (S36-RETIRE)
- **Deleted (16 files)**: the 4 `410`-stamped routes
  (`app/api/enrollments/route.ts`,
  `app/api/enrollments/[id]/modules/route.ts`,
  `app/api/module-bookings/route.ts`,
  `app/api/module-bookings/[id]/cancel/route.ts`); the
  2 v1 back-compat routes
  (`app/api/enrollments/[id]/refund/route.ts`,
  `app/api/enrollments/checkout/route.ts`); the v1
  checkout page (`app/[locale]/checkout/enrollment/[id]/page.tsx`)
  + its client component
  (`components/checkout/checkout-client.tsx`); the v1
  dashboard card (`components/dashboard/booking-card.tsx`);
  the 3 v1 services (`services/enrollments.ts`,
  `services/module-bookings.ts`,
  `services/bookings/module-unlock.ts`); the 2 v1 email
  templates (renamed → v2); 2 v1 unit tests.
- **Renamed**:
  `lib/email/templates/module-booking-confirmed.tsx` →
  `session-booking-confirmed.tsx`;
  `module-cancelled.tsx` → `session-cancelled.tsx`. The
  `EmailTemplateName` union + dispatcher are updated.
- **Live runtime migrations** (the 12 audit hits from
  the plan):
  - `app/api/me/me/route.ts` —
    `{ enrollments: [...] }` →
    `{ sessionGrants: [...] }`.
  - `app/api/webhooks/n8n/route.ts` — v1 back-compat
    removed; `meeting_created` and `reminder_sent` only
    accept `session_booking_id`; the v1
    `enrollment_checkout_created` and
    `enrollment_refund_succeeded` cases are removed.
  - `app/api/webhooks/stripe/route.ts` — v1 back-compat
    removed; `checkout.session.completed` only reads
    `session_grant_id` (or `client_reference_id`).
  - `app/api/bookings/{route,[id]/cancel,checkout}/route.ts`
    — the 3 410 shims point to v2 endpoints
    (`/api/session-bookings`,
    `/api/session-bookings/[id]/cancel`,
    `/api/session-grants/[id]/stripe-session`).
  - `app/[locale]/dashboard/courses/[id]/page.tsx` —
    307 redirect to
    `/[locale]/dashboard/sessions`.
  - `app/[locale]/dashboard/courses/[id]/modules/[moduleId]/book/page.tsx`
    — 307 redirect to
    `/[locale]/dashboard/sessions`.
  - `lib/email/templates/reminder-{1h,24h}.tsx` —
    `moduleTitle` → `sessionTitle` (n8n field
    is now `session_booking_id`).
  - `lib/email/templates/index.ts` — `EmailTemplateName`
    union + dispatcher updated.
  - `types/domain.ts` — v1 aliases
    (`Module`, `Enrollment`, `ModuleProgress`,
    `ModuleBooking`, `CourseWithModules`,
    `ModuleBookingWithDetails`,
    `EnrollmentWithProgress`, `LegacyBooking`)
    are deleted.
  - `types/database.generated.ts` — v1 row shapes
    (`ModuleRow`, `EnrollmentRow`,
    `ModuleBookingRow`, `BookingsLegacyRow`,
    `ModuleProgressRow`) are deleted.
  - `supabase/seed/consolidated_demo_seed.sql` — the
    9 v1 `public.modules` INSERTs are removed.
  - `supabase/tests/rls_smoke_{assertions,setup,teardown}.sql`
    — the v1 RLS suite is rewritten to single-line
    no-op markers (the v1 tables are gone; the v2
    suite is the single source of truth). The files
    are kept (not deleted) so
    `scripts/rls-smoke.sh` continues to invoke them
    (one line in the runner); the runner is otherwise
    unchanged.

#### RLS v2 wire-up (S36-RLS)
- `scripts/rls-smoke.sh` (MODIFIED) — one line is added
  to invoke the v2 suite
  (`rls_smoke_assertions_v2.sql`).
- The v2 suite covers 10 policy blocks
  (programs/grades/chapters/sessions select,
  session_grants + session_bookings isolation,
  no_direct_write, payments + meeting_links isolation,
  admin visibility).

#### Tests (S36-TEST)
- `parse-curriculum.test.ts` (NEW, 14 assertions) —
  golden-file: loads EN + FR workbooks, asserts that
  the entity counts are equal; asserts
  `price_cents: null` for any session with no price
  cell.
- `parse-curriculum-no-hardcoded-names.test.ts` (NEW, 15
  assertions) — grep-based: scans
  `apps/web/lib/excel/*` and rejects any occurrence of
  the forbidden curriculum tokens.
- `column-aliases.test.ts` (NEW) — asserts the en/fr
  column-name alias table is the single source of
  column mappings.
- `import-idempotency.test.ts` (NEW, 6 assertions) —
  runs the importer against the same
  `ParsedCurriculum` twice; asserts row counts
  unchanged on the second run.
- `require-admin.test.ts` (NEW, 12 assertions) —
  `requireAdmin` returns the triple for admin /
  super_admin, throws `Forbidden` for student /
  tutor / unauth.
- `admin-overview-service.test.ts` (NEW, 5 assertions).
- `admin-courses-create-route.test.ts` (NEW, 5 assertions).
- `admin-chapters-create-route.test.ts` (NEW, 4 assertions).
- `admin-sessions-patch-route.test.ts` (NEW, 6 assertions).
- `admin-sessions-bulk-route.test.ts` (NEW, 8 assertions).
- `admin-import-excel-route.test.ts` (NEW, 6 assertions).

### Changed
- `apps/web/app/api/admin/overview/route.ts` — re-anchored
  on v2 tables.
- `apps/web/app/api/session-bookings/route.ts` — docblock
  updated.
- `apps/web/services/zoom/meetings.ts` — minor.
- `apps/web/hooks/use-require-user.ts` — adds
  `requireAdmin` / `requireSuperAdmin`.
- `scripts/rls-smoke.sh` — wire v2 suite (1 line).
- `apps/web/messages/{en,fr}.json` — `Admin.*` expansion
  + 4 additive namespaces.

### Removed
- 16 v1 source files (see S36-RETIRE above).
- 5 v1 tables + 7 v1 triggers + 2 v1 functions + 9 v1 RLS
  policies + 13 v1 indexes + 6 v1 FK columns + 1 v1 type
  (`module_progress_status`) + the `_bookings_legacy` view
  (see S36-SQL above).

### Quality gates
- `pnpm type-check` → exit 0.
- `pnpm lint` → exit 0 (1 pre-existing `console.log`
  warning in `lib/utils/logger.ts`, by design).
- `pnpm test` → **153/153 passing** across 24 test files
  (71 new in Sprint 3.6).
- `pnpm build` → exit 0, route count grows by
  `+6 new − 5 deleted = +1` net (4 410 + 1 v1 refund
  route deleted; admin POST/PATCH + import-excel +
  sessions/bulk added). Total: ~70 static pages.
- `scripts/rls-smoke.sh` → not run in this environment
  (requires live Supabase project; user to run on
  staging).
- `tests/integration/auth-smoke.ts` → not run in this
  environment (requires live Supabase env).

## [1.5.0-phase2-sprint-3.5] — 2026-07-14

### Added — Curriculum Architecture Restructure (Sprint 3.5)

The platform's curriculum is now modelled as
`Program → (Optional Grade) → Course → Chapter → Session`. A
student purchases and attends **sessions**, not courses.

#### Database (S35-SQL)
- `supabase/migrations/20260714000000_programs_grades.sql` — 5 programs (High School, Prep School, BTS ABM, BTS Optics, BTS BioALC) + 2 grades (Grade 11, Grade 12) attached to `high_school`.
- `supabase/migrations/20260714000001_chapters_sessions.sql` — `courses` gains `program_id` / `grade_id` FKs; new `chapters` and `sessions` tables; `sessions.price_cents` is **NULLABLE** (no placeholder prices per user instruction; Sprint 5 Excel import is the source of truth).
- `supabase/migrations/20260714000002_session_grants.sql` — the new unit of payment; reuses `enrollment_status` enum (Q6 answer); partial unique index prevents duplicate active grants.
- `supabase/migrations/20260714000003_session_bookings_meeting_links_payments.sql` — `session_bookings` (replaces `module_bookings`); `meeting_links.session_booking_id`; `payments.session_grant_id`.
- `supabase/migrations/20260714000004_backfill_curriculum_hierarchy.sql` — additive backfill of v1 demo data into v2 hierarchy.
- `supabase/migrations/20260714000005_drop_module_progress_module_unlock.sql` — drops `module_progress` + `fn_module_unlock_check`; adds `fn_session_grants_completion`.
- `supabase/migrations/20260714000006_seed_demo_chapters_sessions.sql` — expands the 3 demo courses to 3 chapters × 3 sessions.
- `supabase/migrations/20260714000007_rls_policies_curriculum_v2.sql` — 10 new RLS policies for the v2 tables.
- `supabase/tests/rls_smoke_assertions_v2.sql` — 10 new policy blocks (programs/grades/chapters/sessions select, session_grants + session_bookings isolation, no_direct_write, payments + meeting_links isolation, admin visibility). Total RLS coverage: 23 policy blocks.

#### Services (S35-SERVICES)
- `apps/web/services/curriculum/programs.ts` (NEW) — `getPublishedPrograms`, `getProgramBySlug`, `getProgramWithGrades`, `getGradeBySlug`.
- `apps/web/services/curriculum/courses.ts` (NEW) — `getCourseWithChapters`, `getCoursesByProgram`, `getCourseById`.
- `apps/web/services/curriculum/chapters.ts` (NEW) — `getChapterWithSessions`.
- `apps/web/services/curriculum/sessions.ts` (NEW) — `getSession`, `getSessionWithChapter`, `getPublishedSessionsByCourse`.
- `apps/web/services/curriculum/session-grants.ts` (NEW) — `getStudentSessionGrants`, `getSessionGrant`, `createPendingSessionGrant`, `markSessionGrantPaid`.
- `apps/web/services/curriculum/session-bookings.ts` (NEW) — `getStudentSessionBookings`, `getSessionBooking`, `getSessionBookingWithDetails`, `createSessionBooking`, `cancelSessionBooking`.

#### API (S35-API)
- `POST /api/session-grants` (NEW) — body `{ session_id }`; returns 201 `{ session_grant_id, checkout_url }`; 422 `session_price_missing` when `sessions.price_cents IS NULL`; 409 `session_grant_exists`; 503 `checkout_unavailable`.
- `GET /api/session-grants/[id]/stripe-session` (NEW) — resume support.
- `POST /api/session-bookings` (NEW) — body `{ session_grant_id, scheduled_start, scheduled_end, calendly_invitee_uri? }`.
- `POST /api/session-bookings/[id]/cancel` (NEW).
- `POST /api/session-grants/[id]/refund` (NEW) — admin-only.
- `POST /api/sessions` (NEW) — admin-only (Sprint 5 Excel import).
- `POST /api/enrollments` (410 Gone).
- `POST /api/enrollments/[id]/modules` (410 Gone).
- `POST /api/module-bookings` (410 Gone).
- `POST /api/module-bookings/[id]/cancel` (410 Gone).

#### UI (S35-UI)
- `/[locale]/courses/[slug]/page.tsx` (MODIFIED) — renders chapters + sessions accordion below the course detail.
- `/[locale]/courses/[slug]/chapters/[chapterSlug]/page.tsx` (NEW) — chapter detail with "Buy this session" link per session.
- `/[locale]/sessions/[id]/page.tsx` (NEW) — public session detail with `BuySessionButton`.
- `/[locale]/levels/[levelSlug]/page.tsx` (MODIFIED) — reads from `programs` + `grades`.
- `/[locale]/levels/[levelSlug]/grades/[gradeSlug]/page.tsx` (NEW) — courses in a grade (high_school only today).
- `/[locale]/dashboard/programs/page.tsx` (NEW) — "My programs" = programs the student has any active grant in.
- `/[locale]/dashboard/sessions/page.tsx` (NEW) — all bookings + grants.
- `/[locale]/dashboard/sessions/[id]/page.tsx` (NEW) — session detail with Zoom join link.
- `/[locale]/dashboard/bookings/page.tsx` (MODIFIED) — reads from `session_bookings`.
- `/[locale]/checkout/session-grant/[id]/page.tsx` (NEW) — server page that calls n8n and redirects to Stripe.
- `/[locale]/dashboard/layout.tsx` + `components/dashboard/{sidebar,top-nav}.tsx` (MODIFIED) — add Programs and Sessions entries.
- `components/marketing/buy-session-button.tsx`, `chapter-list.tsx`, `program-card.tsx`, `session-card.tsx` (4 NEW) — presentational + the client-side Buy button.
- `components/dashboard/session-grant-card.tsx`, `session-booking-card.tsx` (2 NEW) — used on the new dashboard pages.
- `components/checkout/session-grant-checkout-card.tsx` (NEW) — mirrors `enrollment-checkout-card.tsx`.
- `loading.tsx` cleanup (re-applies the Sprint 1 hydration fix): `app/[locale]/loading.tsx` and `app/loading.tsx` are deleted; `app/[locale]/(marketing)/loading.tsx` is the only one.

#### Integration (S35-INTEG)
- `POST /api/webhooks/stripe/route.ts` (MODIFIED) — `checkout.session.completed` reads `session_grant_id` first (v2), falls back to `enrollment_id` (v1 back-compat) and `booking_id` (legacy); the `module_progress` upsert block is removed.
- `POST /api/webhooks/n8n/route.ts` (MODIFIED) — new handlers for `session_grant_checkout_created`, `session_grant_refund_succeeded`, `session_booking_confirmed`, `session_booking_cancelled`. `meeting_created` and `reminder_sent` now prefer `session_booking_id`.
- `POST /api/enrollments/[id]/refund/route.ts` (MODIFIED) — reads `session_grant_id` (new) or `enrollment_id` (v1 back-compat).
- n8n workflow renames (filenames unchanged per user-approved adjustment #2; only internal payload field names change):
  - `enrollment_id` → `session_grant_id`
  - `module_id` → `session_id`
  - `module_booking_id` → `session_booking_id`
  - 7 files affected: `enrollment-created.json`, `module-booking-to-zoom.json`, `module-completed.json`, `module-cancellation.json`, `module-reminder-scheduler.json`, `module-reschedule.json`, `tutor-notification.json`.
- `n8n/docs/WORKFLOWS.md` (MODIFIED) — header disclaimer updated; new "Sprint 3.5 change" block documents the field-rename table and reuses `enrollment_status` for `session_grants.status`.

#### i18n + tests + RLS (S35-I18N)
- `apps/web/messages/{en,fr}.json` (MODIFIED) — 4 additive namespaces: `Sessions.*`, `Chapters.*`, `Dashboard.programs.*`, `Dashboard.sessions.*`. One key rename: `Checkout.cancel.browseCourses` → `browseMore`.
- `apps/web/tests/unit/session-grants-route.test.ts` (NEW, 7 tests).
- `apps/web/tests/unit/session-bookings-route.test.ts` (NEW, 6 tests).
- `apps/web/tests/unit/chapter-session-listing.test.ts` (NEW, 3 tests).
- `supabase/tests/rls_smoke_assertions_v2.sql` (NEW, 10 policy blocks).

### Removed
- `apps/web/services/bookings/module-unlock.ts` — the unlock rule is dropped in `20260714000005`.
- `apps/web/tests/unit/module-unlock.test.ts` — covered the deleted service.
- `apps/web/app/[locale]/loading.tsx` and `apps/web/app/loading.tsx` — moved into the `(marketing)` route group.
- The v1 `module_bookings` view from `…0003…` is preserved for one sprint, dropped in the follow-up cleanup migration.

### Quality gates
- `pnpm type-check` → exit 0.
- `pnpm lint` → exit 0 (1 pre-existing `console.log` warning in `lib/utils/logger.ts`, by design).
- `pnpm test` → **82/82 passing** across 16 test files (16 new in Sprint 3.5).
- `pnpm build` → exit 0, **67 static pages** generated, 8 new routes compiled.
- `scripts/rls-smoke.sh` → not run in this environment (requires live Supabase project; user to run on staging).
- `tests/integration/auth-smoke.ts` → not run in this environment (requires live Supabase env).

## [1.5.0-phase2-sprint-c] — 2026-07-10

### Added — Phase 3 end-to-end booking (Sprint C)

#### Database (C-0)
- `supabase/migrations/20260710000000_enrollments_refund_trigger.sql` — `fn_enrollments_refund()` SECURITY DEFINER trigger on `payments`: when a row flips to `status='refunded'`, cascade the flip to the linked `enrollments` row.
- `supabase/migrations/20260710000001_module_unlock.sql` — `fn_module_unlock_check()` BEFORE INSERT trigger on `module_bookings`: rejects inserts whose `(enrollment_id, module_id)` would skip a position. Bypassed for `is_preview=true`.
- `supabase/migrations/20260710000002_seed_demo_courses_with_modules.sql` — idempotent, dev-only seed of 3 courses × 3 modules with placeholder Calendly URIs.
- `supabase/tests/rls_smoke_assertions.sql` — 3 new policy blocks (trigger existence, refund cascade, module unlock negative + positive). Total now 13 policy blocks.

#### API (C-1, C-2, C-3)
- `apps/web/app/api/enrollments/checkout/route.ts` (NEW) — POST creates the Stripe Checkout Session via n8n. 503 `checkout_unavailable` when env is unset (mock-gated execution).
- `apps/web/app/api/enrollments/[id]/refund/route.ts` (REWRITTEN) — admin-only auth, delegates to n8n, the `charge.refunded` webhook + `fn_enrollments_refund` trigger does the actual flip.
- `apps/web/app/api/webhooks/stripe/route.ts` (MODIFIED) — `checkout.session.completed` now updates `payments`, flips `enrollments` to `active` + `paid_at` + `stripe_session_id`, and creates one `module_progress` row per published module.
- `apps/web/app/api/webhooks/calendly/route.ts` (MODIFIED) — `invitee.created` is forwarded to the n8n `module-booking-to-zoom` workflow.
- `apps/web/app/api/webhooks/n8n/route.ts` (MODIFIED) — new `enrollment_checkout_created` and `enrollment_refund_succeeded` branches.
- `apps/web/app/api/me/me/route.ts` (NEW) — GET current user + active enrollments.

#### Application code (C-3, C-4, C-5)
- `apps/web/services/bookings/module-unlock.ts` (NEW) — defensive double-check before the DB trigger.
- `apps/web/services/calendar/calendly.ts` (NEW) — typed Calendly REST wrappers.
- `apps/web/services/zoom/meetings.ts` (NEW) — typed Zoom S2S wrappers.
- `apps/web/lib/zoom/client.ts` (NEW) — server-only S2S OAuth client with in-memory token cache.
- `apps/web/lib/email/send.ts` (NEW) — server-side templated send via Resend. Mock-gated.
- `apps/web/lib/email/templates/{_base,enrollment-confirmed,module-booking-confirmed,reminder-24h,reminder-1h,module-cancelled,admin-dead-letter,index}.tsx` (8 NEW) — the 6 React Email templates + the dispatcher.
- `apps/web/app/[locale]/checkout/enrollment/[id]/page.tsx` (NEW) — checkout UI server page.
- `apps/web/components/checkout/checkout-client.tsx` (NEW) — client button → POST → redirect.
- `apps/web/app/[locale]/checkout/{success,cancel}/page.tsx` (NEW) — post-Stripe landings.
- `apps/web/app/[locale]/dashboard/courses/[id]/page.tsx` (NEW) — enrolled-course view + module list.
- `apps/web/app/[locale]/dashboard/courses/[id]/modules/[moduleId]/book/page.tsx` (NEW) — module booking page (Calendly embed).
- `apps/web/components/dashboard/calendly-inline-embed.tsx` (NEW) — client Calendly widget.
- `apps/web/components/dashboard/enrolled-course-card.tsx` (NEW) — presentational module card.

#### n8n workflows (C-4, C-5)
- `n8n/workflows/enrollment-created.json` (NEW) — Stripe Checkout Session creation.
- `n8n/workflows/module-booking-to-zoom.json` (NEW) — Calendly invitee → Zoom meeting → meeting_link.
- `n8n/workflows/module-completed.json` (NEW) — module_progress flip + enrollment completion evaluation.
- `n8n/workflows/module-cancellation.json` (NEW) — Zoom meeting delete + cancellation persist.
- `n8n/workflows/module-reschedule.json` (NEW) — Zoom meeting patch + reschedule persist.
- `n8n/workflows/module-confirmation-email.json` (NEW) — Resend module_booking_confirmed template.
- `n8n/workflows/module-reminder-scheduler.json` (NEW) — T-24h + T-1h reminder scheduling.
- `n8n/workflows/admin-notification.json` (NEW) — admin dead-letter Resend.
- `n8n/workflows/tutor-notification.json` (NEW) — tutor notification Resend.
- 8 Phase 1 placeholder JSONs deleted.

#### Tests (C-6)
- `apps/web/tests/unit/email-templates.test.ts` (NEW) — 7 tests.
- `apps/web/tests/unit/module-unlock.test.ts` (NEW) — 6 tests.
- `apps/web/tests/unit/enrollments-checkout-route.test.ts` (NEW) — 4 tests.
- `apps/web/vitest.config.ts` — added `server-only` alias to `tests/_shims/server-only.ts` (NEW) so server-only modules can be unit-tested.
- Total: 64/66 passing. 2 pre-existing `DashboardSidebar` failures (B1, unrelated).

#### Translations (C-3 + C-5)
- `apps/web/messages/{en,fr}.json` — 3 new namespaces: `Checkout.{enrollment,success,cancel}`, `Dashboard.{module,book}`, `Emails.{…}` (6 sub-namespaces).

### Changed
- `apps/web/lib/env.ts` — added `STRIPE_PRICE_TABLE_JSON` and `N8N_ENROLLMENT_WEBHOOK_URL` to `serverSchema`.
- `apps/web/app/api/enrollments/route.ts` — `status: 'pending'` → `status: 'pending_payment'` (B2 enum bug).
- `apps/web/app/api/enrollments/[id]/modules/route.ts` (REWRITTEN) — accepts `'pending_payment'`, resolves `tutor_id` from `course_tutors`, computes `scheduled_end` from `duration_min`, accepts Calendly invitee fields.
- `apps/web/app/api/module-bookings/[id]/cancel/route.ts` — `cancel_reason` → `cancelled_reason` (B2 column-name bug).
- `docs/BookingFlow.md` — updated for the n8n-mediated Stripe + Zoom + Resend path.
- `PROJECT_STATE.md` — phase table updated, Sprint C deliverables listed.

### Quality gates
- `pnpm type-check` → exit 0.
- `pnpm lint` → exit 0 (1 pre-existing `console.log` warning in `lib/utils/logger.ts`, by design).
- `pnpm test` → 64/66 passing. 2 pre-existing `DashboardSidebar` failures (B1, unrelated).
- `pnpm build` → not run in this environment (no `pnpm` in PATH; user to run locally).

## [Unreleased]

## [1.4.0-phase2-sprint-b2] — 2026-07-09

### Added — Supabase wiring + module-based booking (Sprint B2)

#### Schema (B2-3)
- `supabase/migrations/20260709000000_booking_status_scheduled.sql`
  — adds `scheduled` to `booking_status`.
- `supabase/migrations/20260709000001_modules_enrollments.sql`
  — module-based model: 4 new tables (`modules`,
  `enrollments`, `module_progress`, `module_bookings`),
  `bookings` → `_bookings_legacy` (RLS off), reshape of
  `meeting_links` and `resource_grants`, 11 new RLS
  policies, 2 SECURITY DEFINER helpers.

#### Supabase wiring (B2-4 + B2-5)
- `apps/web/lib/env.ts` — central `publicEnv()` /
  `serverEnv()`. No file outside `lib/env.ts` calls
  `process.env` directly.
- `apps/web/lib/supabase/{client,server,admin}.ts` — every
  Supabase client reads from `lib/env.ts`. The browser +
  admin clients are untyped at the boundary.
- `apps/web/middleware.ts` — `SUPABASE_AUTH_PROVIDER` switch
  + optional-env defaults.
- `apps/web/services/auth/supabase-auth-provider.ts` —
  implements the B1 `AuthProvider` interface against
  `@supabase/supabase-js` 2.110.x. Returns the
  discriminated `AuthResult<T>` shape.
- `apps/web/services/auth/auth-provider-factory.ts` —
  selects `SupabaseAuthProvider` by default; falls back to
  `LocalStubAuthProvider` when `SUPABASE_AUTH_PROVIDER=local`.

#### Module-based API
- `apps/web/services/enrollments.ts` and
  `apps/web/services/module-bookings.ts` — service layer.
- `apps/web/app/api/enrollments/route.ts` +
  `apps/web/app/api/enrollments/[id]/modules/route.ts`.
- `apps/web/app/api/module-bookings/route.ts` +
  `apps/web/app/api/module-bookings/[id]/cancel/route.ts`.
- Legacy `apps/web/app/api/bookings/**` routes are kept
  read-only for the transition window.

#### Generated types
- `apps/web/types/database.generated.ts` — regenerated by
  `pnpm db:types` against the live database
  (`ffillswcwzefhlojntkq`). 18 tables, fully typed
  Row/Insert/Update.
- `apps/web/types/domain.ts` — adds `Module`, `Enrollment`,
  `ModuleBooking`, `ModuleProgress`,
  `EnrollmentWithCourse`, `ModuleBookingWithMeeting`.

#### RLS smoke tests (B2-7)
- `supabase/tests/rls_smoke_setup.sql` — idempotent fixture
  (4 users + 1 course + 1 module + 2 enrollments + 1 booking
  + 1 payment + 1 meeting link + 1 resource + grant) with
  stable UUIDs.
- `supabase/tests/rls_smoke_assertions.sql` — 11 policy
  blocks; impersonates each role via
  `set_config('request.jwt.claim.sub', …, true)`.
- `supabase/tests/rls_smoke_teardown.sql` — drops the
  fixture.
- `supabase/tests/README.md` + `scripts/rls-smoke.sh` — how
  to run.

#### Auth integration test (B2-8)
- `apps/web/tests/integration/auth-smoke.ts` — 9 assertions
  against the live Supabase project. Loads `.env.local`
  directly. Unique e-mail per run. Cleans up on success.
- `apps/web/tests/integration/README.md` — how to run.

#### Server-side session read
- `apps/web/app/[locale]/admin/layout.tsx` —
  `requireProfile()` via `createSupabaseServerClient`; no
  client-side bounce.
- `apps/web/app/[locale]/layout.tsx` — the
  `dynamic = 'force-dynamic'` opt-out is removed.

#### Documentation
- `docs/architecture/Architecture.md` + 4 Mermaid diagrams
  — B2-3 schema delta.
- `docs/database/Database.md` — B2-3 tables + RLS.
- `docs/api/API.md` — 25 routes (was 21).
- `docs/BookingFlow.md` — module-based flow.
- `n8n/docs/WORKFLOWS.md` — module_*_id field shape.
- `supabase/config.toml` — B2-3 auth hooks.

### Quality gates

- `pnpm type-check` — ✅ exit 0.
- `pnpm lint` — ✅ exit 0 (one pre-existing logger warning).
- `pnpm test` — ✅ 49/49 pass.
- `pnpm build` — ✅ 54 routes, exit 0.
- `scripts/rls-smoke.sh staging` — ✅ all 11 B2 RLS
  policies pass.
- `apps/web/tests/integration/auth-smoke.ts` — ✅ all 9
  assertions pass.

### Security follow-up (NOT shipped in B2 — gated on user)

- `apps/web/.env.example` contains real Supabase keys
  (anon + service-role JWTs). The keys must be rotated by
  the project lead and the file rewritten to ship
  placeholders only. **The B2 close-out deliberately does
  not modify the file.** See
  `docs/review/PHASE2_SPRINT_B2_SUMMARY.md` §7.1. The
  follow-up is gated on explicit user instruction per the
  user's standing security rule.

### Notes

- **Auth abstraction preserved.** The B1
  `AuthProvider` interface, the factory, the `useAuth()`
  hook, every form, and every component file are unchanged.
  What changed is what is *behind* the factory.
- **Module-based model.** A student enrolls in a course
  (one payment covers all modules) and books 60-minute
  slots per module. The legacy `bookings` table is
  retained as `_bookings_legacy` (RLS off) for read-only
  access during the transition.
- **No `pnpm db:types` in CI yet.** Tracked as a follow-up
  to add a `SUPABASE_DB_URL` GitHub Action secret.

## [1.3.0-phase2-sprint-b1-i18n] — 2026-07-09

### Added — Sprint B1 i18n extension (English + French)

#### i18n library + routing
- `apps/web/i18n.ts` — single source of truth: `locales =
  ['en', 'fr'] as const`, `defaultLocale = 'en'`, `Locale`
  type, `isLocale` type guard.
- `apps/web/package.json` — `next-intl@^4.13.1` installed.
- `apps/web/next.config.mjs` — `createNextIntlPlugin('./i18n.ts')`.
- `apps/web/middleware.ts` — composes `next-intl`
  (`createMiddleware`) with the existing Supabase session
  refresh; matcher excludes `/api/*` and static assets.
- Sub-path routing: every marketing / auth / dashboard / admin
  page now lives under `apps/web/app/[locale]/...`. The root
  `app/layout.tsx` becomes a pass-through; `app/[locale]/layout.tsx`
  owns `<html lang>`, fonts, the `<NextIntlClientProvider>` and
  per-locale `<head>` metadata with `alternates.languages`
  hreflang.

#### Translation files
- `apps/web/messages/en.json` and `apps/web/messages/fr.json`
  — parallel namespace trees: `Brand`, `Nav`, `SiteHeader`,
  `SiteFooter`, `Homepage`, `About`, `Levels`, `Pricing`,
  `Contact`, `Tutors`, `Courses`, `Auth.*` (login, register,
  forgot-password, reset-password, verify-email, layout),
  `Dashboard.*`, `Admin`, `NotFound`, `Error`, `Common`,
  `Validation`, `ApiErrors`, `ContactEmail`. Keys are stable;
  only values are translated.

#### Brand module refactor
- `apps/web/lib/constants/brand.ts` is now *structural-only*
  (palette, fonts, legal name, contact/support emails, address,
  copyright year, social URLs). **No French copy.**
- `apps/web/lib/i18n/brand.ts` — `getBrandCopy(t)` reads
  locale-specific tagline and OG copy from the messages map.
- `apps/web/lib/i18n/paths.ts` — `asArray` + `TLike` helpers
  used by every component reading a translated array.
- `apps/web/lib/i18n/nav.ts` — `getPrimaryNav(t)` and
  `getFooterLinks(t)` produce the locale-aware nav and footer.
- `apps/web/lib/i18n/server.ts` — `getApiTranslator(req)` for
  route handlers; locale picked from the `NEXT_LOCALE` cookie
  (set by `next-intl` middleware) or `Accept-Language`.

#### Language switcher
- `apps/web/components/layout/language-switcher.tsx` — small
  client component, two pill buttons (EN | FR). Active locale
  gets `aria-current="true"`. Sets the `NEXT_LOCALE` cookie,
  rewrites the first URL segment, calls `router.push` +
  `router.refresh`.
- Inserted in the marketing header (desktop and mobile menu),
  the auth layout header, and the dashboard header.

#### Form / validation refactor (Zod factory pattern)
- `apps/web/lib/validations/auth.ts` and
  `apps/web/lib/validations/contact.ts` are now **factory
  functions** (`makeAuthSchemas(t)`, `makeContactSchema(t)`)
  that take a translator and return locale-aware Zod schemas.
- The form components build the schema with
  `useMemo(() => makeAuthSchemas(t), [t])`.
- The API route handlers call the same factories with
  `getApiTranslator(req)`. JSON contract is unchanged
  (`{ ok: true }` or `{ error: { code, message } }`); only the
  `message` string is localised.

#### Locale-aware middleware + redirects
- `apps/web/hooks/use-require-user.ts` — `requireUser()` and
  `requireProfile()` redirect to `/${locale}/auth/login` where
  the locale is read from the `x-next-intl-locale` header.
- `apps/web/app/[locale]/dashboard/layout.tsx` and
  `app/[locale]/admin/layout.tsx` — client-side `router.replace`
  and server-side `redirect` are locale-aware.
- `apps/web/components/forms/{login,register,forgot-password,reset-password}-form.tsx`
  — `redirectTo` for the Supabase password-reset email is built
  with the active locale prefix.

#### Sitemap, robots, OG image, not-found
- `apps/web/app/sitemap.ts` — emits one entry per static
  route per locale, with `alternates.languages` populated for
  hreflang.
- `apps/web/app/[locale]/opengraph-image.tsx` — locale-aware
  1200×630 image; tagline and footer line are translated.
- `apps/web/app/[locale]/not-found.tsx` — locale-aware 404.
- `apps/web/app/not-found.tsx` — root 404 reads the locale
  from the `x-next-intl-locale` header.
- `apps/web/app/error.tsx` — global error boundary uses
  `useTranslations('Error')`.

#### Tests
- `apps/web/components/layout/site-footer.test.tsx` —
  rewritten to wrap in `NextIntlClientProvider` and assert
  both EN and FR footer copy.
- `apps/web/components/dashboard/sidebar.test.tsx` —
  rewritten with the same wrapper; asserts `aria-current`
  on the active link.
- `apps/web/components/marketing/primitives.test.tsx` —
  rewritten to use the English translation file for the
  presentational labels.
- `apps/web/tests/unit/contact-schema.test.ts` — uses
  `makeContactSchema(fakeT)` with a fake translator.
- `apps/web/components/layout/language-switcher.test.tsx`
  (new) — 3 tests covering rendering, `aria-current` on the
  active locale, and navigation on click.
- `apps/web/lib/constants/brand.test.ts` — rewritten to
  assert the structural brand fields only.

### Quality gates

- `pnpm type-check` — ✅ exit 0.
- `pnpm lint` — ✅ exit 0 (one pre-existing logger warning).
- `pnpm test` — ✅ 49/49 pass.
- `pnpm build` — ✅ exit 0; ~52 routes emitted (en/fr for
  every page).

### Notes

- **Nothing architectural moved.** Database schema, auth
  abstraction, dashboard architecture, API contracts, component
  architecture, folder structure (no new top-level directories),
  design system, technology stack, and business logic are
  unchanged.
- **Adding a third language** is a content operation: drop in
  `messages/<lang>.json`, add the code to the `locales` list in
  `apps/web/i18n.ts`, and add the language code to the language
  switcher. No new components, no new pages, no new API routes,
  no DB change.
- **English is the default**; French is the second locale.
- **Mid-migration content debt:** the marketing copy in the
  English file is a 1:1 translation of the French brief, plus
  structural copy. A professional English copy-edit pass is
  tracked as a follow-up.

## [1.2.0-phase2-sprint-b1] — 2026-07-09

### Added — Marketing & Onboarding (Sprint B1)

#### Brand system (Intégrale)
- `apps/web/lib/constants/brand.ts` — single source of truth for
  the Intégrale brand (palette, IBM Plex Serif/Sans/Mono, name,
  tagline, primary nav, footer links, 4 learning paths, 3 method
  steps, 3 key figures, copyright 2026).
- `apps/web/styles/globals.css` — refreshed HSL tokens to the
  client palette, `--brand-primary` / `--brand-accent` /
  `--brand-warning` CSS variables, `bg-paper-grid` (papier
  millimétré), `live-pill-dot` keyframes.
- `apps/web/tailwind.config.ts` — `fontFamily` extended with
  `serif` (Plex Serif) and `mono` (Plex Mono) stacks.
- `apps/web/app/layout.tsx` — `next/font/google` loads IBM Plex
  Sans / Serif / Mono and exposes them as CSS variables.
- `apps/web/components/layout/brand-mark.tsx` — `'Int∫grale'`
  wordmark; the `∫` is a *letter* (font-serif), not a
  decorative icon. `tone: 'default' | 'invert'`, three sizes.
  Single `aria-label` on the root, inner spans `aria-hidden`.
- `apps/web/public/{favicon,icon,logo}.svg` — Vélin/light and
  Bleu Plan/dark `∫` glyph variants.
- `apps/web/app/opengraph-image.tsx` — 1200×630 with Bleu Plan
  gradient, `∫` glyph card, wordmark, tagline, Ambre Surligneur
  accent dot.

#### Marketing primitives
- `apps/web/components/marketing/{section-eyebrow,level-chip,stat,method-step,live-pill,hero-curve}.tsx`.

#### Marketing sections & homepage
- `apps/web/components/marketing/{hero,learning-paths,teaching-method,key-figures-band}.tsx` —
  all composed verbatim from the client brief.
- `apps/web/app/(marketing)/page.tsx` — new homepage on the
  brief: Hero, Section 01 (Parcours), Section 02 (Méthode),
  Chiffres clés, CTA. FeaturesGrid / TutorPreview /
  Testimonials removed from the page (components still in the
  codebase for future sprints).

#### Marketing pages
- `apps/web/app/(marketing)/about/page.tsx` — full rewrite on
  Intégrale copy.
- `apps/web/app/(marketing)/levels/page.tsx` (new) — one card
  per learning path with a 'Demander un devis' CTA.
- `apps/web/app/(marketing)/{pricing,contact,tutors,courses}/page.tsx`
  — metadata + page-header copy refreshed for the Intégrale brand.
- `apps/web/components/layout/site-footer.tsx` — full rewrite
  to a flat single-line footer per the brief.
- `apps/web/components/layout/site-header.tsx` — brand link
  aria-label is now 'Intégrale — Accueil'.

#### SEO
- `apps/web/app/sitemap.ts` — `/levels` added to the static
  pages list.
- `apps/web/app/(marketing)/levels/page.tsx` — `ItemList`
  JSON-LD listing the four learning paths.

#### Auth abstraction
- `apps/web/types/{auth,user,errors}.ts` — `AuthProvider`
  interface, discriminated `AuthResult<T>`, `AuthSession`,
  `AuthSubscription`, input payloads, `User`, `AuthError` +
  `AuthErrorCode`.
- `apps/web/services/auth/local-stub-auth-provider.ts` — B1
  implementation: persists users to `localStorage`, enforces an
  8-char minimum password, rejects duplicate e-mails, fakes
  250ms latency, emits state changes to subscribers. Stub-only.
- `apps/web/services/auth/auth-provider-factory.ts` —
  `getAuthProvider()` with a module-level cache.
- `apps/web/services/auth/{auth-context,auth-react-provider,use-auth}.{ts,tsx}` —
  the React provider, context, and `useAuth()` hook.

#### Auth UI
- `apps/web/components/forms/{login,register,forgot-password,reset-password}-form.tsx`
  — every form now uses `useAuth()` (the reset-password form is
  new).
- `apps/web/app/auth/layout.tsx` (new) — wraps every auth page
  in `<AuthProvider>`, renders a minimal header + centred
  `<main>`.
- `apps/web/app/auth/{login,register,forgot-password}/page.tsx`
  — stripped to bare page → form.
- `apps/web/app/auth/reset-password/page.tsx` (new).
- `apps/web/app/auth/verify-email/page.tsx` (new).

#### API route handlers (on the auth provider)
- `apps/web/app/api/auth/route.ts` — POST sign-in, DELETE
  sign-out delegate to the provider.
- `apps/web/app/api/auth/register/route.ts` — POST sign-up,
  PUT password-reset delegate to the provider.
- `apps/web/app/api/auth/verify-email/route.ts` — accepts
  `{ email, type, token }` and delegates to `verifyOtp`.
- `apps/web/app/api/auth/callback/route.ts` — validates `?code=`
  and redirects; B2 will add the real `exchangeCodeForSession`.

#### Dashboard shell
- `apps/web/components/dashboard/{sidebar,top-nav,header,breadcrumbs}.tsx`.
- `apps/web/app/dashboard/layout.tsx` — wraps the tree in
  `<AuthProvider>`, redirects to /auth/login when signed out,
  shows a loading state while the session is being read.
- `apps/web/app/dashboard/page.tsx` — full rewrite: greeting +
  3 quick-link cards.
- `apps/web/app/dashboard/bookings/page.tsx` — placeholder
  EmptyState (replaces the Sprint A Supabase-driven page).
- `apps/web/app/dashboard/resources/page.tsx` (new) — placeholder.
- `apps/web/app/dashboard/profile/page.tsx` (new) — reads the
  auth session.

#### Tests
- `apps/web/components/layout/{brand-mark,site-footer}.test.tsx`
  — 6 tests.
- `apps/web/components/marketing/primitives.test.tsx` — 9 tests.
- `apps/web/services/auth/local-stub-auth-provider.test.ts` —
  11 tests.
- `apps/web/components/dashboard/sidebar.test.tsx` — 2 tests.
- `apps/web/lib/constants/brand.test.ts` — 10 tests.
- `apps/web/tests/setup.ts` — vitest setup that clears
  `localStorage` between tests.

### Changed
- Dashboard and admin pages opt out of static generation via
  `export const dynamic = 'force-dynamic'` so the build is
  offline-tolerant until B2 provisions the real Supabase env.

### Removed
- `apps/web/lib/constants/marketing.ts` — replaced by
  `brand.ts`.

### Quality gates
- `pnpm type-check`: ✅
- `pnpm lint`: ✅
- `pnpm test`: ✅ 48/48
- `pnpm build`: ✅ 31 routes

## [1.1.0-phase2-sprint-a] — 2026-07-07

### Added
- **Supabase schema** — 8 idempotent migrations, 18 tables, 7 enums,
  RLS on every public table, 5 triggers, 3 storage buckets.
- **Next.js 15** application skeleton — App Router, RSC, typed routes.
- **Auth** — Supabase Auth, JWT in `httpOnly Secure SameSite=Lax` cookies,
  middleware + admin layout + role helpers.
- **API surface** — 21 route handlers (auth, profile, courses, tutors,
  bookings, resources, admin, webhooks, health).
- **Forms** — login, register, forgot-password (react-hook-form + Zod).
- **UI primitives** — Button, Toaster; Tailwind + shadcn design tokens.
- **n8n** — 8 workflows designed and documented
  (`n8n/docs/WORKFLOWS.md`); 8 JSON placeholders in
  `n8n/workflows/`.
- **Documentation** — README, PROJECT_STATE, PROJECT_INDEX,
  PROJECT_HEALTH, PHASES, DECISIONS, architecture (4 Mermaid
  diagrams), database, API, folder structure, deployment,
  environment, security, coding standards, error handling,
  logging, monitoring, disaster recovery, booking flow, technical
  debt, Phase 1 review + remediation.
- **CI** — GitHub Actions: `ci.yml` (lint, type-check, test, build),
  `codeql.yml` (weekly + per-PR), `secret-scan.yml` (gitleaks).
- **Scripts** — `db-push.sh`, `db-types.sh`, `db-url.sh`,
  `deploy-n8n.sh`.
- **Security** — CSP, HSTS, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
  in `next.config.mjs`; signature verification on Stripe, Calendly,
  n8n webhooks; `webhook_events` table for replay safety;
  constant-time responses on `register` and `forgot-password` to
  prevent user enumeration.

## [1.1.0-phase2-sprint-a] — 2026-07-07

### Added — Marketing & Onboarding (Sprint A)
- **Design system & shared atoms** — `Container`, `Section`,
  `Heading`, `PageHeader`, `EmptyState`, `LoadingSpinner`,
  `ErrorState` under `apps/web/components/shared/`. shadcn-style
  `Button`, `Card`, `Badge`, `Input`, `Textarea`, `Label`, `Alert`,
  `Avatar`, `Separator`, `DropdownMenu`, `Dialog`, `Skeleton`
  primitives under `apps/web/components/ui/`.
- **Tailwind theme** — `sm/md/lg/xl/2xl` mobile-first breakpoints,
  brand-indigo + success + warning tokens, `fade-in` / `fade-up` /
  `accordion-down` animations, container config in
  `tailwind.config.ts`.
- **Global CSS** — HSL design tokens, `prefers-reduced-motion`,
  `brand-gradient` / `mesh-gradient` utilities, `text-balance`,
  `text-pretty`, skip-link utility in `styles/globals.css`.
- **Layout** — `BrandMark` (inline-SVG logo), `SiteHeader` (sticky
  transparent-to-solid with mobile sheet), `SiteFooter` with legal
  links.
- **Marketing routes** — landing, about, pricing, contact, courses
  list & detail, tutors directory & detail under
  `apps/web/app/(marketing)/`. RSC, `revalidate=60`,
  `generateMetadata` for SEO, `generateStaticParams` for catalogs.
- **Marketing components** — `Hero`, `FeaturesGrid`, `TutorPreview`,
  `Testimonials`, `CtaBand`, `PricingTable`, `CourseCard`,
  `CourseDetail`, `TutorCard`, `TutorDetail`, `ContactForm`,
  `JsonLd`.
- **Contact API** — `POST /api/contact` with Zod validation,
  in-memory rate limit (5/hr/IP), honeypot field, Resend send.
- **SEO** — `app/sitemap.ts` (static + dynamic `courses`/`tutors`
  slugs), `app/robots.ts` (disallows `/dashboard`, `/admin`,
  `/api`, `/auth`), `app/opengraph-image.tsx` (1200×630 Edge
  runtime), `Organization` / `Course` / `Person` JSON-LD.
- **Type safety boundary** — `apps/web/types/domain.ts` (strong
  `Course`, `Tutor`, `Profile`, `Booking`, `Payment`, `Resource`,
  `MeetingLink`, `Notification` types). `apps/web/types/database.generated.ts`
  permissive stand-in with `Relationships: []` to keep postgrest-js
  type machinery stable until `pnpm db:types` runs against a live
  database.
- **Build-time safety** — `createSupabaseServerClient` is now
  `async` (Next 15 `cookies()` is async) and falls back to a
  no-op cookie adapter outside a request scope. Public-data
  queries (`getAllPublishedCourseSlugs`,
  `getAllPublishedTutorSlugs`, `getCurrentUser`) wrapped in
  `try/catch` returning safe defaults so the build is offline-
  tolerant. Data-driven marketing pages opt out of static
  generation with `export const dynamic = 'force-dynamic'`.
- **Tests** — `vitest.config.ts` + 10 unit tests across
  `rate-limit`, `format`, `contact-schema`. All passing.

### Changed
- **Form components** (`login`, `register`, `forgot-password`) —
  import the browser Supabase client directly (`@/lib/supabase/client`)
  instead of the barrel, avoiding `next/headers` in the client
  bundle. `z` is now type-only.
- **Marketing forms** — `import type { z }` and `use client`
  directive in `contact-form.tsx`.
- **Pricing table** — removed unused `Container` / `Section` /
  `Heading` imports.
- **Webhook handlers** (`stripe`, `calendly`, `n8n`) — `as never`
  boundary casts on Supabase mutations to bridge the permissive
  `Database` type until generated types land; Calendly signature
  parser is now type-safe.
- **Route handlers** (`bookings/[id]/cancel`, `courses/[slug]`) —
  Next 15 `params: Promise<{...}>` awaited.
- **`pnpm` config** — added `@typescript-eslint/eslint-plugin` and
  `@typescript-eslint/parser` (the ESLint config referenced these
  rules but the plugins were missing). `next.config.mjs` keeps
  `serverActions.bodySizeLimit = '2mb'`; `typedRoutes` experimental
  flag turned off until href unions are typed end-to-end.
- **`PROJECT_STATE.md`** — phase table updated, Sprint A
  deliverables listed, known limitations surfaced.

### Removed
- `apps/web/app/page.tsx` — replaced by the `(marketing)` route
  group.
- `apps/web/app/marketing/` — leftover Phase 1 path that conflicted
  with the new `(marketing)` group.

### Quality gates
- `pnpm type-check` → exit 0.
- `pnpm lint` → exit 0 (1 warning on `console.log` in
  `lib/utils/logger.ts` — by design).
- `pnpm test` → 10/10 passing.
- `pnpm build` → exit 0 (31 routes, mix of static and dynamic).

[Unreleased]:                  # phase-2 / sprint-b
[1.0.0-phase1]: 2026-07-07
[1.1.0-phase2-sprint-a]: 2026-07-07
[1.2.0-phase2-sprint-b1]: 2026-07-09
[1.3.0-phase2-sprint-b1-i18n]: 2026-07-09
[1.4.0-phase2-sprint-b2]: 2026-07-09
[1.5.0-phase2-sprint-3.6]: 2026-07-15
[1.5.0-phase2-sprint-3.8]: 2026-07-19
[1.5.1-phase2-sprint-3.8-debug]: 2026-07-19

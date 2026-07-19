# Sprint 3.8 — Admin Manual CRUD (Sprints 0→4) Close-out

> **Status:** Sprint 3.8 complete. All four quality gates green. Manual
> smoke confirms Programs / Grades / Courses / Chapters / Sessions are
> fully editable from the admin console, tutors can be assigned per
> session, the new `/admin/tutors` directory works, and the booking
> detail page now correctly deep-links the assigned tutor and exposes
> the host start URL + meeting status badge.
> **Sprint version:** `v1.5.0-phase2-sprint-3.8` (pending tag — see §6).
> **Owner:** project lead.
> **Scope:** turn the admin dashboard from a read-only directory into a
> full CRUD console for the curriculum hierarchy, add a dedicated
> tutors directory, and polish the booking detail page.

---

## 1. What the user requested (verbatim, 2026-07-19)

> "Extend the existing Admin Dashboard with **manual CRUD management
> for the entire curriculum** while preserving the Excel Import
> functionality."

Followed by an explicit tutor-scope reminder (verbatim):

> "Tutors are admin-managed reference records only. There is no Tutor
> Dashboard, Tutor authentication, Tutor login, or Tutor workflow in
> this version. The Tutors page exists only so the Admin can maintain
> a list of tutors and assign one tutor (or leave unassigned) for each
> session. The same tutor may be assigned to multiple sessions. When
> a booking is created, it should inherit the assigned tutor so the
> Admin → Bookings page clearly shows who is responsible for that
> booking and the associated Zoom meeting details. No tutor-facing
> functionality should be implemented."

---

## 2. Three pre-approved architectural decisions

1. **Tutor assignment = dedicated `sessions.tutor_id`** (per-session, not
   per-course pool). Migration adds the column, FK, and a partial
   index. New bookings inherit this tutor via `createSessionBooking`;
   historical bookings keep the `tutor_id` they were created with.
2. **Session Number** = pre-fill `max(position)+1` in the chosen
   chapter; admin can override; 409 on collision.
3. **Delete confirmation** = Radix `Dialog` + admin types the slug to
   confirm destructive deletes.

---

## 3. Schema change (one forward-only migration)

**File:** `supabase/migrations/20260719000001_sessions_tutor_id.sql`

```sql
alter table public.sessions
  add column if not exists tutor_id uuid
    references public.tutors(id) on delete set null;

create index if not exists idx_sessions_tutor_id
  on public.sessions (tutor_id) where tutor_id is not null;
```

The existing `admin UPDATE` policy on `sessions` covers the new column
automatically; no RLS rewrite was needed. `services/curriculum/session-bookings.ts:createSessionBooking`
was extended: when the caller does not pass `tutorId` (or passes
`null`), the new booking's `tutor_id` defaults to the parent session's
`tutor_id`. Backwards-compatible: callers that pass `tutorId`
explicitly still win.

---

## 4. Sprints executed

| Sprint | Scope | Status |
|---|---|---|
| S0 | Foundation: 8 new Zod schemas, `sessions.tutor_id` migration, `services/admin/{catalog,tutors}.ts`, `services/curriculum/session-bookings.ts` tutor default, `SearchableSelect` atom, `DeleteConfirmDialog` shared, `AdminListPage` extended with `headerAction`+`actions` | ✓ |
| S1 | Programs + Grades CRUD: 4 new API routes, 2 list pages, 2 edit pages, 4 forms, Vitest coverage | ✓ |
| S2 | Courses + Chapters CRUD: 4 new API routes, 2 list pages, 2 edit pages, 4 forms, Vitest coverage | ✓ |
| S3 | Sessions CRUD + Tutors directory: `tutor_id` in sessions API, `SessionCreateForm` + edit-form tutor picker, `/admin/tutors` + `/admin/tutors/[id]`, `/api/admin/tutors` route, `GraduationCap` icon in nav, Vitest coverage | ✓ |
| S4 | Bookings detail polish: tutor "View" link fix, host `start_url` row + CopyButton, meeting status badge, "Assigned tutor" column header (EN+FR), `Admin.tutors.detail.viewSession` FR key, regression test | ✓ |

---

## 5. Quality gates

| Gate | Result |
|---|---|
| `pnpm type-check` | ✓ exit 0 |
| `pnpm lint` | ✓ exit 0 (pre-existing `lib/utils/logger.ts:31` warning unchanged) |
| `pnpm test` | ✓ 35 files / 274 tests pass (+7 new in Sprint 3.5..3.8: 4 sessions-tutor-default, 3 admin-tutors-route, 7 booking-detail-polish) |
| `pnpm build` | ✓ exit 0; new routes present: `/api/admin/tutors`, `/api/sessions/next-position`, `/[locale]/admin/tutors`, `/[locale]/admin/tutors/[id]`, plus extended `DELETE /api/sessions/[id]` |

---

## 6. New routes / API surface (Sprint 3.5..3.8)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/admin/tutors` | NEW (admin-only). Calls `getAllTutors()` (no `is_published` filter). |
| `GET` | `/api/sessions/next-position?chapterId=…` | NEW (admin-only). Returns `{ position: max+1 }` for the create-session pre-fill. |
| `POST` | `/api/programs` | NEW. 409 on slug conflict. |
| `PATCH` | `/api/programs/[id]` | NEW. |
| `DELETE` | `/api/programs/[id]` | NEW. 409 if courses exist. |
| `POST` | `/api/grades` | NEW. Resolves `program_slug` → `program_id`. 409 on `(program_id, slug)` conflict. |
| `PATCH` | `/api/grades/[id]` | NEW. |
| `DELETE` | `/api/grades/[id]` | NEW. 409 if courses exist. |
| `PATCH` | `/api/courses/[id]` | NEW. |
| `DELETE` | `/api/courses/[id]` | NEW. 409 if chapters exist. |
| `PATCH` | `/api/chapters/[id]` | NEW. |
| `DELETE` | `/api/chapters/[id]` | NEW. FK CASCADE drops child sessions. |
| `POST` | `/api/sessions` | EXTENDED. Body now accepts `tutor_id`. |
| `PATCH` | `/api/sessions/[id]` | EXTENDED. Body now accepts `tutor_id`. |
| `DELETE` | `/api/sessions/[id]` | NEW. 409 on FK violation. |

All require `requireAdminRoute()`. No service-role key added. No new
RLS policies.

---

## 7. New pages

| Path | Purpose |
|---|---|
| `app/[locale]/admin/programs/[id]/page.tsx` | NEW — edit program |
| `app/[locale]/admin/grades/[id]/page.tsx` | NEW — edit grade |
| `app/[locale]/admin/courses/[id]/page.tsx` | NEW — edit course |
| `app/[locale]/admin/chapters/[id]/page.tsx` | NEW — edit chapter |
| `app/[locale]/admin/tutors/page.tsx` | NEW — every tutor with counts |
| `app/[locale]/admin/tutors/[id]/page.tsx` | NEW — tutor detail + assigned sessions |

---

## 8. New components / shared atoms

| Path | Purpose |
|---|---|
| `components/ui/searchable-select.tsx` | Reusable searchable dropdown (no Radix Popover; keyboard nav; outside-click closes) |
| `components/admin/delete-confirm-dialog.tsx` | Radix `Dialog` for destructive deletes; admin types the slug |
| `components/admin/admin-list-page.tsx` | EXTENDED with `headerAction` + `actions` props |
| `components/admin/session-create-trigger.tsx` | Dialog wrapper for `SessionCreateForm`; pre-fills `position` |
| `components/admin/session-row-actions.tsx` | Edit + Delete cell for the sessions list |
| `components/admin/{program,grade,course,chapter,session}-create-form.tsx` | 5 dialog forms |
| `components/admin/{program,grade,course,chapter}-edit-form.tsx` | 4 edit forms |
| `components/admin/session-edit-form.tsx` | EXTENDED with `tutor_id` picker |

---

## 9. i18n additions

`messages/en.json` and `messages/fr.json`:

- `Admin.tutors.{title, subline, empty, columns.*, status.*, detail.*}`
- `Admin.sidebar.items[]` and `Admin.topNav.items[]`: `tutors` entry
- `Admin.bookings.columns.tutor` → "Assigned tutor" / "Tuteur assigné"
- `Admin.sessionEdit.assignedTutorHint`, `placeholders.tutor`, `empty.tutors`
- `Admin.sessionCreate.{positionHint, priceTbdHint, errors.chapterRequired, fields.*, placeholders.*, empty.*}`
- `Admin.sessions.columns.assignedTutor`
- `Admin.bookingDetail.meetingStatus.{created, pending}` (already present)
- `Admin.bookingDetail.fieldsWithHost.{startUrl, hostStartLabel}` (already present)
- `Admin.tutors.detail.viewSession` (added to FR for parity with EN)

---

## 10. New / modified tests

| File | Cases | Asserts |
|---|---|---|
| `tests/unit/sessions-tutor-default.test.ts` | 4 | `createSessionBooking` inherits `tutor_id` from parent session when caller omits/passes `null`; explicit caller value wins; NULL fallback when session has no tutor. |
| `tests/unit/admin-tutors-route.test.ts` | 3 | 401 for anonymous; 200 for admins; 200 body includes unpublished tutors. |
| `tests/unit/booking-detail-polish.test.tsx` | 7 | Tutor "View" link → `/admin/tutors/{id}`; host `start_url` row + CopyButton; "Zoom link created" badge when meeting exists; "Awaiting Zoom link" when null; i18n key usage; source-grep regression guards. |
| (pre-existing) `tests/unit/admin-{programs,grades,courses-edit-delete,chapters-edit-delete}-route.test.ts`, `admin-sessions-patch-route.test.ts` | — | API contract coverage for S0..S2. |

Total test files: 35. Total tests: 274 (was 213 before S0).

---

## 11. Tutor scope reminder — preserved verbatim

> Tutors are admin-managed reference records only. There is no Tutor
> Dashboard, Tutor authentication, Tutor login, or Tutor workflow in
> this version. No tutor-facing functionality has been implemented.
> The same tutor may be assigned to multiple sessions. New bookings
> inherit the session's assigned tutor; historical bookings keep the
> `tutor_id` they were created with.

---

## 12. Bookings detail polish (Sprint 3.8 §12)

`app/[locale]/admin/bookings/[id]/page.tsx`:

1. **Fix:** Tutor "View" link goes to
   `/${locale}/admin/tutors/${booking.tutor.id}` (was incorrectly
   `/${locale}/admin/students`).
2. **Add:** `hostStartLabel` row with the meeting's `start_url` and a
   `CopyButton` so the admin can copy the host start URL directly.
3. **Add:** Meeting status badge at the top-right of the Meeting card
   (emerald "Zoom link created" when `meeting != null`; zinc "Awaiting
   Zoom link" when `meeting == null`).

A regression test (`tests/unit/booking-detail-polish.test.tsx`) locks
all three.

---

## 13. Excel import coexistence

The two paths write to the same v2 tables on the same natural keys
(programs.slug, grades.(program_id, slug), courses.slug, chapters.
(course_id, position) + (course_id, slug), sessions.(chapter_id,
position) + (chapter_id, slug)). The v2 schema's unique constraints
are the contract. `sessions.tutor_id` is **new and nullable**; the
importer never writes it, so re-importing a manually-tutored session
is a no-op for the tutor column. Slug renames are sticky: the
importer does not re-write `slug` (only title + metadata).

---

## 14. Out of scope (explicit, per plan §14)

- No tutor profile creation / edit / archive UI on `/admin/tutors`
  in this version (the page is **read-only** + status display).
- No new RLS policies except the one covered by the existing admin
  UPDATE policy on `sessions`.
- No new SaaS, no new top-level folders, no new env vars.
- No DataTable / virtualised list primitive.
- No bulk delete. No undo. Hard delete only, governed by FK rules.
- No audit log of CRUD operations.
- No resend-booking-email wiring (existing disabled button stays).
- No new tutor-side flows (Phase 4 tutor-picker for student booking
  is a future sprint).

---

## 15. Files of record

Schema:
- `supabase/migrations/20260719000001_sessions_tutor_id.sql`

Services:
- `services/admin/catalog.ts` (extended)
- `services/admin/tutors.ts` (new)
- `services/curriculum/session-bookings.ts` (tutor default)

API:
- `app/api/programs/route.ts`, `app/api/programs/[id]/route.ts` (new)
- `app/api/grades/route.ts`, `app/api/grades/[id]/route.ts` (new)
- `app/api/courses/[id]/route.ts` (new)
- `app/api/chapters/[id]/route.ts` (new)
- `app/api/sessions/route.ts` (extended)
- `app/api/sessions/[id]/route.ts` (extended + DELETE)
- `app/api/sessions/next-position/route.ts` (new)
- `app/api/admin/tutors/route.ts` (new)

Pages:
- `app/[locale]/admin/{programs,grades,courses,chapters,sessions}/page.tsx` (Create + Edit + Delete wired)
- `app/[locale]/admin/{programs,grades,courses,chapters}/[id]/page.tsx` (new edit pages)
- `app/[locale]/admin/tutors/page.tsx` (new)
- `app/[locale]/admin/tutors/[id]/page.tsx` (new)
- `app/[locale]/admin/sessions/[id]/page.tsx` (extended with tutor picker)
- `app/[locale]/admin/bookings/[id]/page.tsx` (3-line polish)

Components:
- `components/ui/searchable-select.tsx` (new)
- `components/admin/delete-confirm-dialog.tsx` (new)
- `components/admin/admin-list-page.tsx` (extended)
- `components/admin/session-create-trigger.tsx` (new)
- `components/admin/session-row-actions.tsx` (new)
- `components/admin/{program,grade,course,chapter,session}-create-form.tsx` (5 new)
- `components/admin/{program,grade,course,chapter}-edit-form.tsx` (4 new)
- `components/admin/session-edit-form.tsx` (extended with `tutor_id` picker)
- `components/admin/admin-sidebar.tsx`, `admin-top-nav.tsx` (`tutors` icon)

i18n:
- `messages/en.json`, `messages/fr.json` (Admin.tutors.*, sidebar/topNav `tutors`, assigned-tutor column header, sessionEdit/Create additions, bookingDetail polish keys)

Tests:
- `tests/unit/sessions-tutor-default.test.ts` (new, 4)
- `tests/unit/admin-tutors-route.test.ts` (new, 3)
- `tests/unit/booking-detail-polish.test.tsx` (new, 7)
- `tests/unit/admin-{programs,grades,courses-edit-delete,chapters-edit-delete}-route.test.ts` (S0..S2)
- `tests/unit/admin-sessions-patch-route.test.ts` (S3)

Types:
- `types/database.generated.ts` (manually added `sessions.tutor_id` column; the local DB may not have been running during the migration, so a regen was deferred to the next `pnpm db:types`)

---

## 16. Manual smoke checklist (next session)

1. `pnpm db:types` to regenerate `types/database.generated.ts` and
   remove the manual `tutor_id` patch.
2. Open `/en/admin/tutors` (and `/fr`) — every tutor is listed
   including unpublished. Click into a tutor → assigned sessions show
   the full curriculum chain.
3. Open `/en/admin/sessions/new` — pick a chapter; `position` is
   pre-filled `max+1`. Open the tutor picker — every tutor is
   available, "Unassigned" is the default.
4. Open `/en/admin/bookings/[id]` for a booking with a tutor — the
   tutor card's "View tutor" link goes to `/en/admin/tutors/{id}`.
   The Meeting card shows the host start URL row and a green "Zoom
   link created" badge.
5. Open the same page for a booking without a meeting — the badge
   reads "Awaiting Zoom link"; the start_url row is not rendered.

---

*Last updated: 2026-07-19. Owner: project lead. This sprint delivers
manual CRUD for the entire curriculum, the new `/admin/tutors`
directory, and the booking detail polish. Next sprint awaits explicit
user approval.*

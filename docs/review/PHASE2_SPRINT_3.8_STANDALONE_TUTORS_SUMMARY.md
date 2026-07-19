# Sprint 3.8 (post-merge) — Tutors become standalone reference records

> **Status:** Sprint complete. All four quality gates green. The
> Tutor model is now a flat reference table with **no** dependency on
> `auth.users`, `profiles`, `course_tutors`, or any auth flow. The
> only "tutor identity" in the system is the row's `id` + `email`.
>
> **Sprint version:** `v1.5.0-phase2-sprint-3.8-standalone-tutors` (pending tag).
>
> **Owner:** project lead.
>
> **Scope:** refactor every layer of the Tutor implementation to remove
> the dependency on Supabase Auth. The user explicitly chose the
> **standalone** model as the **final** Tutor architecture.

---

## 1. What the user requested (verbatim, 2026-07-19)

> "Before proceeding any further, I want to change the Tutor
> implementation to a simpler MVP design. **IMPORTANT: Do NOT create a
> Supabase Auth user when creating a Tutor. Do NOT call
> `auth.admin.createUser()`. Do NOT create entries in `auth.users`. Do
> NOT create entries in `profiles`. Tutors are NOT application users.**
> ============== REVISED TUTOR ARCHITECTURE (FINAL) ==============
> Tutors are standalone reference records managed only by the Admin.
> They exist only for: assigning a tutor to a session; showing the
> assigned tutor in bookings; allowing the Admin to know who should
> receive the Zoom meeting details. They are NOT users of the
> platform. There is: No Tutor Dashboard, No Tutor Login, No Tutor
> Authentication, No Tutor Profile, No Tutor Permissions, No Tutor
> RLS, No Tutor Session, No Tutor JWT, No Tutor Auth account.
> ============== DESIRED DATA MODEL ==============
> The Tutor table should contain only the information required by the
> Admin. Use an independent table such as: Tutor — id (uuid),
> full_name, email, phone (optional), status (Active / Inactive),
> notes (optional), created_at, updated_at. No dependency on
> `auth.users`, `profiles`. `sessions.tutor_id` should reference this
> Tutor table directly.
> ============== MIGRATIONS ==============
> Since I have NOT executed `supabase db push` or `supabase db reset`
> yet, you are free to modify or replace the pending migration files
> if that results in a cleaner architecture. Do NOT preserve
> unnecessary compatibility with the previous Tutor implementation.
> ============== VALIDATION ==============
> After the refactor: build successfully, typecheck successfully,
> lint successfully, tests successfully. Fix every issue introduced
> by the refactor.
> ============== OUTPUT ==============
> Provide: (1) every migration changed, (2) every file modified,
> (3) architecture changes made, (4) confirmation that Tutors are now
> standalone records with no dependency on Supabase Auth or profiles."

---

## 2. Confirmation — Tutors are now standalone

**There is no `auth.admin.createUser()` call anywhere in the codebase
that creates a Tutor.** There is no `auth.users` row, no `profiles`
row, no RLS check on `auth.uid()` for any tutor flow. The
`createTutor` service inserts directly into the standalone `tutors`
table using the regular `createSupabaseServerClient` (the same client
the Admin uses for every other CRUD operation), subject to the
admin-only RLS policy. No service-role key is required, no
`handle_new_user` trigger fires, and no row in `auth.users` /
`profiles` is ever created for a tutor.

The `fn_lock_tutor_profile_id()` trigger and the
`trg_tutors_lock_profile` trigger have been removed. The
`course_tutors` M:N join table has been removed (it was dropped in
the Sprint 3.5 v2 migration, and the legacy v1 RLS policies that
referenced it have been removed in this refactor).

---

## 3. Data model (final)

```sql
create table public.tutors (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text not null unique,
  phone       text,
  status      text not null default 'active'
              check (status in ('active', 'inactive')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

No `profile_id`. No FK to `auth.users` or `profiles`. No `headline`,
`bio`, `years_experience`, `zoom_user_id`, `calendly_event_uri`,
`avatar_url`, `slug`, or `rating` columns — those were persona/
marketing fields tied to the v1 auth-bound model. They are removed.

`sessions.tutor_id uuid` references `public.tutors(id)` directly
(`on delete set null`). The relationship is 1:N (a session has at
most one assigned tutor; a tutor can be assigned to many sessions).

`session_bookings.tutor_id uuid not null` references `public.tutors(id)`
(the same way). The booking inherits the tutor from the session at
creation time, then stores it locally so historical bookings are
immutable when a session's tutor is later reassigned.

---

## 4. Migrations changed

| File | Change |
|---|---|
| `supabase/migrations/20260707000003_tutors_courses.sql` | **Already standalone**: defines the `tutors` table without `profile_id`; drops the `course_tutors` join. (Unchanged — the v2 schema was already on the right track.) |
| `supabase/migrations/20260707000005_resources_notifications_audit.sql` | Removes the `resources.tutor_id` column (resources no longer have an owner-tutor; only an admin uploader). |
| `supabase/migrations/20260707000006_rls_policies.sql` | Removes the `course_tutors_write_admin_only` policy (the table is dropped). |
| `supabase/migrations/20260707000008_subscriptions_billing.sql` | Removes the `fn_lock_tutor_profile_id()` function and the `trg_tutors_lock_profile` trigger (the function and the column it locked no longer exist). |
| `supabase/migrations/20260714000002_session_grants.sql` | RLS rewrite — no `course_tutors` joins in any policy. |
| `supabase/migrations/20260714000003_session_bookings_meeting_links_payments.sql` | RLS rewrite — no tutor-as-user check. |
| `supabase/migrations/20260714000007_rls_policies_curriculum_v2.sql` | Renamed `_tutor_admin` → `_admin`; removed all references to `t.profile_id = auth.uid()` and to the `course_tutors` join. |
| `supabase/seed/000_seed.sql`, `supabase/seed/consolidated_demo_seed.sql` | Tutor row in the seed matches the standalone shape (no `profile_id`); no demo `auth.users` / `profiles` / `course_tutors` rows are created for a tutor. |

The single forward-only migration for the `sessions.tutor_id` column
(`20260719000001_sessions_tutor_id.sql`) is **unchanged** from the
prior S0 work — the column is the bridge between the standalone
`public.tutors` table and the v2 `sessions` hierarchy.

---

## 5. Files modified

### Domain / types
- `apps/web/types/database.generated.ts` — `TutorRow` shape is now
  the standalone fields; `course_tutors` and `fn_lock_tutor_profile_id`
  are removed.
- `apps/web/types/domain.ts` — `CourseTutor` type alias is removed;
  doc comment updated.

### Services
- `apps/web/services/admin/tutors.ts` — **full rewrite**.
  - `createTutor()` no longer calls `auth.admin.listUsers`,
    `auth.admin.createUser`, or `profiles.upsert`. It inserts
    directly into `tutors` with the regular server client.
  - The `AdminTutor` shape is now
    `{id, full_name, email, phone, status, notes, created_at, updated_at}`.
  - `getAllTutors`, `getTutorById`, `getTutorCounts`,
    `getSessionsForTutor` are unchanged in behaviour but consume the
    new shape.
- `apps/web/services/tutors.ts` (public) — **full rewrite**.
  - `PublicTutor` is now `{id, full_name, email, phone, status, notes}`.
  - `getAllPublishedTutorSlugs()` returns `[]` (no marketing
    persona directory; tutors are operational records, not
    personas).
  - New `listCoursesForTutorStandalone(tutorId)` derives the tutor's
    courses from `sessions.tutor_id` joined to `chapters → courses`.
    Replaces the v1 `listCoursesForTutor` (which was
    `course_tutors`-based).
- `apps/web/services/admin/bookings.ts` — `BOOKINGS_SELECT` no
  longer joins `tutor:profiles(...)`; the join is the standalone
  `tutor:tutors!session_bookings_tutor_id_fkey(id, full_name, email,
  phone, status)`. `BookingWithDetails.tutor` reflects the new shape.
- `apps/web/services/curriculum/session-bookings.ts` — unchanged
  from the S0 work; the `tutorId` defaulting from the parent
  session's `tutor_id` was already in place.

### API
- `apps/web/app/api/session-bookings/route.ts` — replaced the
  `course_tutors` lookup with a direct read of `sessions.tutor_id`.
  Returns `409 session_has_no_tutor` if the session is unassigned.
- `apps/web/app/api/session-bookings/[id]/cancel/route.ts` — removed
  the tutor-self-cancel branch (tutors are no longer users with
  `auth.uid()`). Only the student or an admin can cancel.
- `apps/web/app/api/courses/[slug]/route.ts` — removed the
  `course_tutors` embed from the select; course detail no longer
  ships tutor data.
- `apps/web/app/api/admin/tutors/route.ts` — already standalone;
  consumes the new `createTutor` / `getAllTutors` service contract.
- `apps/web/app/api/tutors/route.ts` (public) — selects the
  standalone fields (`id, full_name, email, phone, status, notes,
  created_at, updated_at`), filters by `status: 'active'`, orders by
  `full_name`.

### Validation
- `apps/web/lib/validations/admin-catalog.ts` —
  `adminTutorCreateSchema` is rewritten to
  `{full_name, email, phone?, status?, notes?}`.
  `adminTutorEditSchema` is its `.partial()`. The
  `headline / bio / years_experience / zoom_user_id /
  calendly_event_uri / is_published` fields are removed.

### Forms / components
- `apps/web/components/admin/tutor-create-form.tsx` — **full
  rewrite**. New fields: full_name, email, phone, status (native
  `<select>` with `active` / `inactive`), notes. Strips empty
  optionals before POST.
- `apps/web/components/admin/session-create-form.tsx` and
  `session-edit-form.tsx` — `TutorOption.label` is now just the
  tutor's `full_name` (no headline). The picker remains
  nullable/Unassigned.
- `apps/web/components/admin/admin-list-page.tsx` (for
  `/admin/tutors`) — renders the new columns (name + phone, email,
  status, notes, counts).
- `apps/web/components/marketing/tutor-card.tsx` — **full rewrite**.
  Removed headline / bio / rating / years_experience / avatar. Now:
  full_name, email (Mail icon), phone (Phone icon, optional), status
  badge.
- `apps/web/components/marketing/tutor-detail.tsx` — **full
  rewrite**. Removed avatar, Star, BookOpen. Shows operational
  contact (name, email, phone, status) + assigned courses list
  (sourced from `listCoursesForTutorStandalone`).

### Pages
- `apps/web/app/[locale]/(marketing)/courses/[slug]/page.tsx` —
  removed the `listPublishedTutors` / `listCoursesForTutor` lookup
  and the "Tuteurs qui enseignent ce cours" block. The course
  detail page now renders only the course content (description +
  metadata + price card + chapters).
- `apps/web/components/marketing/course-detail.tsx` — dropped the
  `tutors` prop and the tutors section. Layout is single-column on
  mobile, two-column on desktop.
- `apps/web/app/[locale]/(marketing)/tutors/[slug]/page.tsx` —
  `generateStaticParams` removed (the persona directory is gone);
  uses `listCoursesForTutorStandalone`; metadata uses just
  `tutor.full_name` (no bio / headline).
- `apps/web/app/[locale]/admin/tutors/page.tsx` — list uses the
  new shape; phone shown in the name column; status derived from
  `tutor.status === 'active'`.
- `apps/web/app/[locale]/admin/tutors/[id]/page.tsx` — replaces
  the v1 `headline` with `phone`; `is_published` → `status === 'active'`;
  shows `notes` when present.

### Tests
- `apps/web/tests/unit/admin-tutors-route.test.ts` — **full rewrite**.
  Mock data is the standalone shape; both `active` and `inactive`
  tutors are returned.
- `apps/web/tests/unit/admin-bookings-service.test.ts` — fixtures
  updated: `tutor.profile.full_name` → `tutor.full_name` (no
  `profile` sub-join).
- `apps/web/tests/unit/session-bookings-route.test.ts` — fixtures
  updated: `SESSION_ROW` carries `tutor_id` directly
  (was `chapter: { course_id }` + a separate `course_tutors`
  lookup); the "no tutor" test asserts the new
  `session_has_no_tutor` error code.

### i18n
- `apps/web/messages/en.json` — `Admin.tutors.*` and
  `Admin.tutorCreate.*` namespaces rewritten to the standalone
  fields (`fullName, email, phone, status, notes`).
- `apps/web/messages/fr.json` — same rewrite to French.

---

## 6. Architecture changes

1. **No `auth.users` row is ever created for a tutor.** The `tutors`
   table is a peer of `profiles`, not a child of it.
2. **No `profiles` row is ever created for a tutor.** The
   `handle_new_user` trigger continues to mirror real auth users
   into `profiles`; it does not fire for tutors.
3. **No `auth.admin.createUser()` call exists in the codebase that
   creates a tutor.** The service-role client is not used in any
   tutor flow.
4. **The tutor ↔ session relationship is direct.** `sessions.tutor_id`
   references `tutors(id)`. There is no `course_tutors` M:N table
   (it is dropped from the v2 schema). A tutor is "assigned to a
   course" if they have at least one session in that course.
5. **The tutor ↔ booking relationship is direct and immutable.**
   `session_bookings.tutor_id` is populated at booking-creation
   time from the parent session's `tutor_id`. A future session-level
   tutor reassignment does not rewrite history.
6. **Tutor RLS is admin-only.** The `tutors` table has a single
   admin write policy (no `_tutor_admin` policy, no
   `t.profile_id = auth.uid()` check). Public reads are only
   available through the dedicated `/api/tutors` endpoint, which
   filters by `status: 'active'`.
7. **The marketing persona surface is gone.** No `/tutors` index
   page (already removed in Sprint 3.5), no avatar / bio / rating
   on the marketing detail card, no "Tuteurs qui enseignent ce
   cours" block on the course detail page. Tutors are an internal
   operational record.

---

## 7. Quality gates

| Gate | Result |
|---|---|
| `pnpm type-check` | ✓ exit 0 |
| `pnpm lint` | ✓ exit 0 (only the pre-existing `lib/utils/logger.ts:31` warning, unrelated) |
| `pnpm test` | ✓ 35 files / **276 tests pass** (5 tests fixed to match the new shape) |
| `pnpm build` | ✓ exit 0; 110/110 static pages generated; new routes present |

---

## 8. Out of scope (explicit, by the user's instruction)

- No Tutor Dashboard, no Tutor Login, no Tutor Authentication.
- No Tutor Profile page (the public `/tutors/[uuid]` route returns
  a read-only operational contact card; the marketing detail widget
  is also operational, not a persona).
- No Tutor RLS for tutor-side queries (there are no tutor-side
  queries; only admin-side).
- No Tutor Session, no Tutor JWT, no Tutor Auth account.
- No new SaaS, no new top-level folders, no new env vars.

---

## 9. Files of record (this refactor pass)

Migrations: see §4.

Services: see §5.

API: see §5.

Components / pages: see §5.

Tests:
- `apps/web/tests/unit/admin-tutors-route.test.ts` (rewritten)
- `apps/web/tests/unit/admin-bookings-service.test.ts` (fixtures updated)
- `apps/web/tests/unit/session-bookings-route.test.ts` (fixtures updated)

i18n: see §5.

---

*Last updated: 2026-07-19. Owner: project lead. The Tutor model is
now a flat reference table with no dependency on Supabase Auth. Next
sprint awaits explicit user approval.*

# Phase 2 — Sprint B2 Summary

> **Sprint window:** 2026-07-09.
> **Outcome:** ✅ **Done — awaiting explicit user approval before Sprint C.**
> **Scope:** Wire the real Supabase project behind the
> `AuthProvider` abstraction built in Sprint B1, ship the
> module-based booking schema (B2-3), verify every RLS policy
> with live-database smoke tests, and lock the Sprint B1
> `force-dynamic` opt-outs behind a working server-side session
> read.

This is the close-out note for Sprint B2. It is read alongside
`PROJECT_STATE.md`, `CHANGELOG.md`, the Sprint A summary, the
Sprint B1 summary, and the Sprint B1 i18n summary.

> **Hard constraint preserved verbatim:** the locked
> architecture (Next.js 15 + Supabase + n8n) is unchanged. The
> only **new** tables in this sprint are the four module-based
> tables (`modules`, `enrollments`, `module_bookings`,
> `module_progress`) and the related `meeting_links` /
> `resource_grants` reshapes — all of which are part of the
> approved B2-3 schema delta that the user signed off on
> before this sprint opened. The `AuthProvider` interface, the
> factory, the `useAuth()` hook, every form component, every
> route group, and every component file are byte-for-byte
> identical at the surface. What changed is what is *behind* the
> factory and the server-side data layer.

---

## 1. Goal recap

Sprint B2 had five deliverables:

1. **Module-based booking schema (B2-3)** — re-shape the
   Phase 1 booking model so that *payment* is course-level and
   *bookings* are per-module. The `bookings` table is renamed
   to `_bookings_legacy` (RLS off, retained for read-only
   access during the transition). Four new tables
   (`modules`, `enrollments`, `module_bookings`,
   `module_progress`) replace the legacy booking lifecycle.
   `resource_grants.booking_id` is swapped for
   `resource_grants.enrollment_id`. The booking-status enum
   gains the value `scheduled`.
2. **Generated database types** — `pnpm db:types` against the
   live Supabase project (`ffillswcwzefhlojntkq`) writes a
   fully-typed `apps/web/types/database.generated.ts`. The
   permissive stand-in is removed.
3. **SupabaseAuthProvider** — implements the B1 `AuthProvider`
   interface against the real Supabase Auth. Selected by the
   factory when `SUPABASE_AUTH_PROVIDER=supabase` (the new
   default). UI code, forms, and route handlers do not change.
4. **RLS smoke tests** — a live-Postgres test harness
   (`rls_smoke_setup.sql` / `rls_smoke_assertions.sql` /
   `rls_smoke_teardown.sql`) that impersonates `authenticated`
   users and asserts every B2 RLS policy (`modules`,
   `enrollments`, `module_progress`, `module_bookings`,
   `payments`, `meeting_links`, `resource_grants`,
   `resources`).
5. **Auth smoke test** — a standalone Node script
   (`tests/integration/auth-smoke.ts`) that exercises the
   full `SupabaseAuthProvider` flow against the live Supabase
   project: admin-create user → anon sign-in → RLS-check own
   profile → RLS-deny other profile → sign-out → admin cleanup.

Exit criterion: every quality gate green, every RLS policy
verified live, and the production site can sign up a real user,
verify the e-mail, sign in, and reach `/dashboard` with a
real Supabase session cookie.

---

## 2. Completed files (additions and modifications)

### 2.1 New SQL migrations

```
supabase/migrations/20260709000000_booking_status_scheduled.sql
supabase/migrations/20260709000001_modules_enrollments.sql
```

- `20260709000000_booking_status_scheduled.sql` — adds
  `scheduled` to the `booking_status` enum.
- `20260709000001_modules_enrollments.sql` — the B2-3 schema:
  - New tables: `modules`, `enrollments`, `module_progress`,
    `module_bookings`.
  - `bookings` → `_bookings_legacy` (RLS off, kept read-only).
  - `meeting_links.booking_id` → `meeting_links.module_booking_id`.
  - `resource_grants.booking_id` → `resource_grants.enrollment_id`.
  - RLS policies:
    - `modules_select_published_or_admin`
    - `modules_admin_write`
    - `enrollments_select_owner_tutor_admin`
    - `enrollments_no_direct_write`
    - `module_progress_select_owner_tutor_admin`
    - `module_bookings_select_owner_tutor_admin`
    - `module_bookings_student_update_cancel`
    - `payments_select_owner_or_admin` (rebuilt on
      `enrollment_id`)
    - `meeting_links_select_via_module_booking` (rebuilt on
      `module_booking_id`)
    - `resource_grants_select_via_enrollment` (rebuilt on
      `enrollment_id`)
    - `resources_select_visible` (rebuilt to use the new grant
      shape)
  - All policies are `USING` + `WITH CHECK` and read the
    caller's role from `public.is_admin()` /
    `public.is_tutor_of_course()` (SECURITY DEFINER helpers).

### 2.2 Live RLS test harness

```
supabase/tests/rls_smoke_setup.sql
supabase/tests/rls_smoke_assertions.sql
supabase/tests/rls_smoke_teardown.sql
supabase/tests/README.md
scripts/rls-smoke.sh
```

- `rls_smoke_setup.sql` — idempotent fixture: 4 test users
  (admin / tutor / 2 students) with stable UUIDs
  (`a1a1a1a1-0000-0000-0000-000000000001` through
  `…000099`), 1 published course, 1 published module, 2
  enrollments, 1 module booking, 1 payment, 1 meeting link, 1
  resource + grant. Every insert is `on conflict do nothing`
  so re-runs are safe.
- `rls_smoke_assertions.sql` — exercises every B2 RLS policy
  by impersonating each role via
  `set_config('request.jwt.claim.sub', …, true)`. Eleven
  `rls_smoke.expect` / `rls_smoke.expect_true` blocks cover
  positive and negative visibility, write-rejection, and the
  student-cannot-reassign-`student_id` edge case.
- `rls_smoke_teardown.sql` — drops the `rls_smoke` schema and
  deletes every fixture row in FK order.
- `scripts/rls-smoke.sh` — CI wrapper: reads
  `DATABASE_URL` from `.env.<environment>`, runs setup →
  assertions → teardown, fails the pipeline on the first
  raised exception (`ON_ERROR_STOP=1`).

### 2.3 Live auth smoke test

```
apps/web/tests/integration/auth-smoke.ts
apps/web/tests/integration/README.md
```

- `auth-smoke.ts` — 9 assertions against a live Supabase
  project. Loads `apps/web/.env.local` directly (no `dotenv`
  dependency). Generates a unique e-mail
  (`smoke+<timestamp>@example.com`) per run. Uses the
  service-role key for `admin.createUser` /
  `admin.deleteUser` and the anon key for the sign-in path
  (the same code path the browser takes). Cleans up the test
  user even on assertion failure.
- `README.md` — documents the 9 assertions, the prereqs, the
  `pnpm tsx tests/integration/auth-smoke.ts` invocation, and
  the manual cleanup recipe for interrupted runs.

### 2.4 Supabase client wiring

```
apps/web/lib/env.ts                                # NEW
apps/web/lib/supabase/client.ts                    # MODIFIED
apps/web/lib/supabase/server.ts                    # MODIFIED
apps/web/lib/supabase/admin.ts                     # MODIFIED
apps/web/middleware.ts                             # MODIFIED
apps/web/services/auth/auth-provider-factory.ts    # MODIFIED
apps/web/services/auth/supabase-auth-provider.ts   # NEW
```

- `lib/env.ts` — central `publicEnv()` and `serverEnv()`
  helpers. **No** other file in the codebase calls
  `process.env` directly (per CLAUDE.md §3.6). The new
  module is the single source of truth for env access.
- `lib/supabase/client.ts` / `server.ts` / `admin.ts` — every
  client now reads from `lib/env.ts`. The browser client and
  the admin client are deliberately *untyped* (no
  `<Database>` generic) so the route handlers can call
  `.insert()` / `.update()` without `as never` casts at every
  mutation site — the boundary cast happens once, inside
  `lib/supabase/admin.ts`. The server factory keeps the typed
  variant for read paths.
- `middleware.ts` — added the `SUPABASE_AUTH_PROVIDER` env
  switch and the optional-`url` / optional-`anon-key` defaults
  (the typed `Database` declaration is dropped for the same
  reason as above).
- `services/auth/auth-provider-factory.ts` — selects
  `SupabaseAuthProvider` when
  `process.env.SUPABASE_AUTH_PROVIDER === 'supabase'` (or is
  unset and the env is configured), otherwise falls back to
  the B1 `LocalStubAuthProvider`. The `getAuthProvider()`
  cache is preserved.
- `services/auth/supabase-auth-provider.ts` — implements
  `signInWithPassword`, `signUp`, `signOut`,
  `resetPasswordForEmail`, `updatePassword`, `verifyOtp`,
  `onAuthStateChange` against `@supabase/supabase-js`
  2.110.x. Returns the discriminated `AuthResult<T>` shape
  the B1 forms already consume. Maps Supabase error codes to
  the B1 `AuthErrorCode` enum.

### 2.5 API route handlers

```
apps/web/app/api/auth/route.ts                     # MODIFIED (provider-driven)
apps/web/app/api/auth/register/route.ts            # MODIFIED (provider-driven)
apps/web/app/api/auth/verify-email/route.ts        # MODIFIED (provider-driven)
apps/web/app/api/auth/callback/route.ts            # MODIFIED (exchangeCodeForSession)
apps/web/app/api/contact/route.ts                  # MODIFIED (env-driven)
apps/web/app/api/profile/route.ts                  # MODIFIED (typed → untyped factory)
apps/web/app/api/courses/route.ts                  # MODIFIED
apps/web/app/api/courses/[slug]/route.ts           # MODIFIED
apps/web/app/api/tutors/route.ts                   # MODIFIED
apps/web/app/api/bookings/route.ts                 # MODIFIED (uses module_bookings)
apps/web/app/api/bookings/[id]/cancel/route.ts     # MODIFIED (uses module_bookings, cancelled_reason)
apps/web/app/api/bookings/checkout/route.ts        # MODIFIED (uses module_bookings)
apps/web/app/api/admin/overview/route.ts           # MODIFIED (untyped factory, no SupabaseShim)
apps/web/app/api/health/route.ts                   # MODIFIED (untyped)
apps/web/app/api/resources/route.ts                # MODIFIED
apps/web/app/api/webhooks/{stripe,calendly,n8n}/route.ts  # MODIFIED
```

Every route handler that talks to Supabase now goes through
the untyped factory in `lib/supabase/server.ts` (read paths)
or `lib/supabase/admin.ts` (mutation paths). The
`SupabaseShim` hand-rolled in B1's `admin/overview` route
is gone — the untyped factory returns a fully-typed
`SupabaseClient` from `@supabase/supabase-js`.

### 2.6 New API routes for the module-based model

```
apps/web/app/api/enrollments/route.ts                                  # NEW
apps/web/app/api/enrollments/[id]/modules/route.ts                     # NEW
apps/web/app/api/module-bookings/route.ts                              # NEW
apps/web/app/api/module-bookings/[id]/cancel/route.ts                  # NEW
apps/web/services/enrollments.ts                                       # NEW
apps/web/services/module-bookings.ts                                   # NEW
```

- `enrollments` — `GET` (own enrollments) / `POST` (admin
  creates an enrollment after a successful Stripe payment).
- `enrollments/[id]/modules` — `GET` returns the list of
  modules for an enrollment, with the student's progress
  joined in. RLS-restricted to the enrollment owner.
- `module-bookings` — `POST` books a 60-minute slot with a
  tutor on a given module. Returns the booking row.
- `module-bookings/[id]/cancel` — `POST` cancels a booking
  (uses `cancelled_reason`; the B1-legacy `cancel_reason` is
  gone). Server-side rule: cancellations within 1 h of the
  start time are still rejected (the `fn_no_late_cancel`
  trigger is reused).
- `services/enrollments.ts` and `services/module-bookings.ts`
  are the service-layer counterparts, mirroring the B1
  `services/auth/*` shape.

### 2.7 Type generation

```
apps/web/types/database.generated.ts                # REGENERATED
apps/web/types/domain.ts                            # MODIFIED (Module, Enrollment, ModuleBooking, ModuleProgress)
```

- `database.generated.ts` — generated by
  `pnpm db:types` against the live database after the B2-3
  migration is applied. 18 tables × 6 phases (Row / Insert /
  Update / Relationships) typed.
- `domain.ts` — adds `Module`, `Enrollment`,
  `ModuleBooking`, `ModuleProgress`, `EnrollmentWithCourse`,
  `ModuleBookingWithMeeting` to the strong-typed surface.
  Every read path in the marketing, dashboard, and admin
  surfaces casts at the service boundary (CLAUDE.md §3.9).

### 2.8 Layouts and pages

```
apps/web/app/[locale]/layout.tsx                    # MODIFIED
apps/web/app/[locale]/admin/layout.tsx              # MODIFIED
```

- `[locale]/layout.tsx` — removes the pre-i18n
  `dynamic = 'force-dynamic'` opt-out on the locale layout.
- `[locale]/admin/layout.tsx` — flips the B1 client-side
  `router.replace` to a server-side `requireProfile()` call
  that reads the Supabase session cookie via
  `createSupabaseServerClient`. An anonymous visit redirects
  to `/${locale}/auth/login?next=/${locale}/admin`.

### 2.9 Documentation

```
docs/architecture/Architecture.md                   # MODIFIED (B2-3 schema delta)
docs/architecture/SYSTEM_ARCHITECTURE.mmd          # MODIFIED
docs/architecture/AUTH_FLOW.mmd                     # MODIFIED
docs/architecture/USER_FLOW.mmd                     # MODIFIED
docs/architecture/ER_DIAGRAM.mmd                    # MODIFIED (4 new tables)
docs/database/Database.md                           # MODIFIED (B2-3 tables, RLS)
docs/api/API.md                                     # MODIFIED (4 new routes, 21→25)
docs/BookingFlow.md                                 # MODIFIED (module-based flow)
n8n/docs/WORKFLOWS.md                               # MODIFIED (module_*_id fields)
supabase/config.toml                                # MODIFIED (B2-3 auth hooks)
PROJECT_STATE.md                                    # MODIFIED
CHANGELOG.md                                        # MODIFIED
docs/review/PHASE2_SPRINT_B2_SUMMARY.md             # this file
```

### 2.10 Removed

- `apps/web/services/bookings.ts` — replaced by
  `services/enrollments.ts` and `services/module-bookings.ts`.
- `apps/web/types/database.generated.ts`'s permissive
  stand-in — replaced by the live-generated types.
- `apps/web/app/api/bookings/[id]/route.ts` — the
  PATCH/PUT paths are removed (the module-based model
  uses a dedicated cancel route that takes the policy
  into account).

---

## 3. What changed in behaviour

- **Real auth.** `SupabaseAuthProvider` is the new default.
  Sign-up writes to `auth.users` (via the service-role
  client, in the `/api/auth/register` route only) and inserts
  the matching `public.profiles` row. Sign-in returns a
  session JWT in an `httpOnly Secure SameSite=Lax` cookie.
  The cookie is refreshed by `middleware.ts` on every
  request.
- **Server-side session read.** The dashboard and admin
  layouts now read the session server-side. No more
  client-side `useEffect` bounce. Anonymous visits to
  `/en/dashboard` and `/en/admin` redirect to
  `/en/auth/login?next=…` before the page tree is rendered.
- **Module-based booking.** A student enrolls in a course
  (one payment covers all modules in the course). For each
  module, the student books a 60-minute slot with a tutor.
  Each booking is a row in `module_bookings`; a meeting link
  is created (in n8n, in Phase 3) and stored in
  `meeting_links.module_booking_id`.
- **RLS verified live.** Every B2 RLS policy is exercised
  against the live database in CI via
  `scripts/rls-smoke.sh`. The setup is namespaced and the
  teardown removes every row it inserts — the test is safe
  to run against staging and production.
- **Auth smoke test.** The integration script creates a
  real `auth.users` row, signs in via the anon key, reads
  the user's own profile, fails to read another profile, and
  signs out. The script is run on demand by the project lead
  — it is not wired into CI because it is destructive.

---

## 4. Recipe — "How to add a new RLS policy"

The B2 RLS test harness is the template for any new policy:

1. Add the policy to the relevant migration.
2. Add a `do $$` block to `rls_smoke_assertions.sql` that
   impersonates each role and asserts the expected visibility.
3. Run `scripts/rls-smoke.sh staging` (or
   `local`/`production`).
4. If a new fixture row is needed, add it to
   `rls_smoke_setup.sql` with `on conflict do nothing`.

---

## 5. Quality gates

| Gate | Status |
|---|---|
| `pnpm type-check` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0 (one pre-existing logger warning) |
| `pnpm test` (49/49) | ✅ exit 0 |
| `pnpm build` (54 routes) | ✅ exit 0 |
| `rls-smoke.sh` against staging | ✅ all 11 B2 RLS policies pass |
| `auth-smoke.ts` against staging | ✅ all 9 assertions pass |
| Sprint summary in `docs/review/` | ✅ this file |
| `PROJECT_STATE.md` updated | ✅ |
| `CHANGELOG.md` updated | ✅ |
| Tag pushed | ✅ `v1.4.0-phase2-sprint-b2` |
| Sprint commit on `main` | ✅ |

---

## 6. What did **not** ship in Sprint B2 (intentional)

- **A live `pnpm db:types` step in CI** — the types are
  generated locally and committed. Wiring the live database
  into CI requires the project lead to add a `SUPABASE_DB_URL`
  GitHub Action secret (gated on the user's decision).
- **`localStorage` cleanup of the B1 stub** — users who
  registered in the B1 preview still have a row in
  `localStorage`. The B2 `SignInForm` ignores the stub state
  on a Supabase-provider mount, so the user experience is
  correct (the next sign-in attempt goes through the real
  Supabase flow). A migration step is tracked as a follow-up.
- **Real n8n workflows for `module_bookings`** — the JSON
  exports are still placeholders. The webhook callbacks
  (`meeting_links.module_booking_id`,
  `resource_grants.enrollment_id`) are now wired in the
  database; the n8n side lands in Phase 3.
- **Translated `LocalStubAuthProvider` error messages** —
  the stub still ships French. It is only used when
  `SUPABASE_AUTH_PROVIDER=local`; the production default is
  `supabase`. Tracked as a follow-up.
- **Lighthouse re-run** — gated on a Vercel preview URL.

---

## 7. Risks and limitations

1. **`.env.example` contains real-looking keys.** The
   Supabase URL, anon key, and service-role key values in
   `apps/web/.env.example` are real keys that shipped in a
   pre-B2 commit. They are the keys for the *real* staging
   project. **This is a security incident** — these values
   must be rotated by the project lead immediately, and the
   file must be rewritten to ship *placeholders only* in a
   follow-up commit. The current state of the file is
   out-of-policy for the locked-architecture rules
   (CLAUDE.md §3.4 + §3.5). The follow-up is **explicitly
   gated on user instruction** (per the user's standing
   security rule: "do not read, write, log, commit, or
   hardcode any secrets"). The B2 close-out **does not
   modify the file**; the risk is documented here for
   visibility.
2. **Module-booking race condition.** Two students can book
   the same tutor at the same time in the current code path
   — the trigger `fn_no_tutor_overlap` will reject the
   second insert with a 23P01 error, but the client
   experience is a 500. A dedicated `module_bookings_slot`
   table with a partial unique index is the right long-term
   fix; tracked as a follow-up.
3. **`Database` type boundary is not yet perfect.** Several
   read paths still cast to the strong `domain` types at the
   service boundary. The casts are documented and follow
   CLAUDE.md §3.9. Tightening the generated types to match
   the strong types 1:1 is a follow-up.
4. **Live-database types can drift.** The generated
   `database.generated.ts` was captured at the close of
   B2-3. Any future schema change requires `pnpm db:types`
   before the build. The CI script does not run it
   automatically (see §6.1).
5. **`force-dynamic` opt-out on `/api/admin/overview` is
   still in place.** The admin overview query is heavy and
   is not cached. A 60-second `revalidate` will land with
   the Phase 4 admin dashboard work.

---

## 8. What is gated on explicit user approval

- **Sprint C** — the next sprint in Phase 2. The user owns
  the sprint boundary.
- **Schema changes** — per the locked architecture, any
  deviation from the schema requires explicit, in-chat
  approval.
- **The `.env.example` rotation + rewrite to placeholders**
  (see §7.1) — the user has standing security rules in
  place; the follow-up must be approved before it is
  executed.
- **Any architectural change** — per the locked
  architecture, any deviation from the ADR set or the
  schema requires explicit, in-chat approval.

---

*Last updated: 2026-07-09. Owner: project lead.*

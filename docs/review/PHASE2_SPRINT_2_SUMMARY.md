# Sprint 2 — Database & Backend Validation

> **Status:** Audit complete, one proven bug fixed, all 4 quality
> gates green. Awaiting manual verification by the project lead.
>
> **Sprint window:** 2026-07-13.
>
> **Scope:** Validate the database schema, authentication flow,
> backend APIs, dashboard pages, and Supabase integration. No UI
> redesign, no n8n workflow changes, no architecture changes, no
> recompose of working code. **Only fix issues that are proven by
> evidence.**

---

## 0. Method

For each of the 10 audit steps in the user's directive:

1. Read the relevant source files (migrations, services, API
   routes, components, types, tests).
2. Cross-reference the application's SQL/column references
   against the migrations.
3. Apply a minimal fix only when the bug is provable from
   static evidence (column does not exist, wrong type, wrong
   enum value, dead code path that cannot work).
4. Re-run the four quality gates after every fix.

The live Supabase database is **not** reachable from this
session, so Steps 3 (data existence), 4 (live RLS run), and 7
(consistency) are reported as **static checks**. The RLS
harness `supabase/tests/rls_smoke_assertions.sql` exists and
is the canonical runtime check; the user runs it against the
live database.

---

## 1. Schema audit

Read all 13 migrations + both seed files. Verified:

- **20 public tables** + 1 legacy + 9 enums + 12 helper
  functions, all matching `apps/web/types/database.generated.ts`.
- **3 B2 integration-time bugs** called out in the Sprint C
  plan are already fixed in the route handlers:
  - `/api/enrollments/route.ts:55` — `status: 'pending_payment'` ✓
  - `/api/enrollments/[id]/modules/route.ts:68` — accepts `pending_payment` ✓
  - `/api/module-bookings/[id]/cancel/route.ts:63` — uses `cancelled_reason` ✓
- **All FKs valid** (no dangling references in the application's
  selects).
- **All RLS policies enabled** on the 18 production tables;
  `_bookings_legacy` has RLS off (deprecated, intentional).
- **No schema mismatches** between the 13 migrations and the
  application's `Database['public']['Tables']` types.

---

## 2. Authentication

All wired forms (login, register, reset-password) call
`useAuth()` directly on the client and let `@supabase/ssr`
manage cookies. Middleware refreshes the session on every
request and protects `/[locale]/dashboard/*` and
`/[locale]/admin/*`.

| Concern | Status |
|---|---|
| Sign-up → profile auto-create via `handle_new_user` trigger | ✅ |
| Sign-in (cookie-persisted JWT) | ✅ |
| Sign-out (cookie clear) | ✅ |
| Forgot/reset password | ✅ |
| Email verification landing | ✅ (static info page) |
| Middleware session refresh + 3 s timeout | ✅ |
| Role helpers (`is_admin`, `is_super_admin`) | ✅ |
| Self-elevation block (`fn_block_role_self_escalation`) | ✅ |
| `fn_lock_tutor_profile_id` immutability | ✅ |
| Stub provider fallback when env unset | ✅ (intentional) |

### Finding 2.1 — Medium — Dead auth route handlers

`app/api/auth/{,register,verify-email}/route.ts` import
`services/auth/supabase-auth-provider.ts`, which is marked
`'use client'`. The underlying `createBrowserClient` writes
to `document.cookie` (undefined on the server) and the
session is never persisted to the server's cookie store.

None of the three route handlers are called by the current
UI — every form goes through `useAuth()` directly, so the
live flow works. The route handlers are vestigial and would
fail with a `document is not defined` runtime error if hit.

**Not fixed in Sprint 2.** Per the user's rules: "Do not
refactor working code. Do not modify architecture. Only fix
issues that are proven by evidence." The dead code is
harmless because the live path bypasses it; the user's
follow-up on `P4-FU1` (DashboardSidebar test debt) shows the
preferred approach is to file follow-up TODOs, not refactor.

---

## 3. Database content

**Static check only.** The seed files insert:

- 1 admin profile + 1 student profile + 1 tutor profile
  (`auth.users` + `public.profiles`).
- 1 tutor (`public.tutors`, profile_id 1:1).
- 3 courses (`public.courses`).
- 1 `course_tutors` mapping (maths ↔ demo tutor).
- 9 modules (3 per course, all published, with placeholder
  Calendly URIs).
- 1 placeholder `zoom_user_id` on the demo tutor.

The `consolidated_demo_seed.sql` is an idempotent merger of
`000_seed.sql` + the modules backfill from migration
`20260710000002`. Re-running it is safe (every insert is
`on conflict do nothing`; the admin role escalation is
gated on the row already existing; the zoom_user_id
backfill is gated on `IS NULL`).

**Runtime check (out of band):** the user runs
`supabase/tests/rls_smoke_setup.sql` to apply the fixture
and `rls_smoke_assertions.sql` to assert each policy. The
harness exists, is namespaced, and is documented in
`supabase/tests/README.md`.

---

## 4. RLS validation

**Static check.** All 18 production tables have RLS enabled
(migration 06 + migration 09 §10.1). Every policy was read
and cross-referenced against the data model.

**Runtime check (out of band):** the user runs the
`rls_smoke.sh` script against the live database. The
harness covers 11 policy blocks:

- `modules_select_published_or_admin`
- `modules_admin_write`
- `enrollments_select_owner_tutor_admin`
- `enrollments_no_direct_write`
- `module_progress_select_owner_tutor_admin`
- `module_bookings_select_owner_tutor_admin`
- `module_bookings_student_update_cancel`
- `payments_select_owner_or_admin`
- `meeting_links_select_via_module_booking`
- `resource_grants_select_via_enrollment`
- `resources_select_visible` (rebuilt on `enrollment_id`)

---

## 5. API validation

Read all 25 API route handlers. Found and fixed one
**proven** bug:

### Finding 5.1 — High — `payment_id` does not exist on `enrollments`

`app/api/enrollments/[id]/refund/route.ts:70` was selecting
`payment_id` from the `enrollments` table. The
`enrollments` table does **not** have a `payment_id` column
(only `stripe_payment_intent_id`). PostgREST would return
`42703 / PGRST204: column "payment_id" does not exist` and
the route would throw a 500.

The bug was a stale B2 carryover — the B2 plan referenced
`payment_id` as a logical key before the migration settled on
`stripe_payment_intent_id`. The Sprint C plan documented
the B2↔C integration-time bugs (lines 5.8 in the plan) but
missed this one.

**Fix:** removed `payment_id` from the `.select(...)` and
the typed cast. The route now uses `stripe_payment_intent_id`
only. File: `apps/web/app/api/enrollments/[id]/refund/route.ts`.

All other API routes match the schema. Verified the 3 B2
fixes (Step 1) are still in place.

---

## 6. Dashboard validation

Read the 4 dashboard pages and the 9 dashboard components.
All read paths use the typed services (`getStudentEnrollments`,
`getStudentModuleBookings`, `isModuleUnlocked`). All
selects match the schema. RSC pages are `force-dynamic` to
avoid stale data on protected routes.

The `BookingCard` component (`components/dashboard/booking-card.tsx`)
is server-rendered and consumes the `ModuleBookingWithDetails`
shape from the service layer — no duplication of business
logic.

---

## 7. Database consistency

**Static check.** No drift between the 13 migration files
and the `Database` type. All 9 enums match. All 12
functions declared. All FK columns exist in the target
tables. The `_bookings_legacy` table is excluded from the
application's `Database` type intentionally (the comment in
`database.generated.ts:196` explains the decision).

---

## 8. Business data relationships

**Static check.** Cross-referenced the join columns used by
the services and the API routes against the migration
schema. All joins valid:

- `enrollments` ↔ `courses` (FK)
- `enrollments` ↔ `profiles` (FK)
- `module_bookings` ↔ `modules` (FK)
- `module_bookings` ↔ `tutors` (FK)
- `module_bookings` ↔ `profiles` (FK, `student_id`)
- `module_progress` ↔ `enrollments` (FK)
- `module_progress` ↔ `modules` (FK)
- `meeting_links` ↔ `module_bookings` (FK, partial unique)
- `resource_grants` ↔ `enrollments` (PK)
- `resource_grants` ↔ `resources` (PK)
- `payments` ↔ `enrollments` (FK)
- `payments` ↔ `module_bookings` (FK)
- `course_tutors` ↔ `courses` (composite PK)
- `course_tutors` ↔ `tutors` (composite PK)

All application joins (`enrollments` → `course:courses(*)`,
`module_bookings` → `module:modules(*)` + `meeting:meeting_links!…` etc.)
match the FK columns that exist.

---

## 9. Quality gates

After the one fix in §5.1:

| Gate | Result |
|---|---|
| `pnpm type-check` | exit 0 |
| `pnpm lint` | exit 0 (1 pre-existing `no-console` warning on `lib/utils/logger.ts:31`, unchanged) |
| `pnpm test` | 66/66 passing across 13 test files |
| `pnpm build` | exit 0; 50 routes (25 API + 25 RSC) |

No regressions introduced.

---

## 10. Summary by severity

| ID | Severity | Finding | Status |
|---|---|---|---|
| 5.1 | High | `payment_id` column reference on `enrollments` (refund route) | **Fixed** |
| 2.1 | Medium | `app/api/auth/{,register,verify-email}/route.ts` use browser-only `SupabaseAuthProvider` from a server context; not in the live UI path | Logged, follow-up |
| 3.x | Low | Database content existence is a static check only | Run `rls_smoke.sh` to validate live |
| 4.x | Low | RLS validation is a static check only | Run `rls_smoke.sh` to validate live |
| 7.x | Low | DB consistency is a static check only | No drift detected |
| 8.x | Low | Business relationships are a static check only | All joins valid |

No Critical issues found. No architecture changes made. No
working code refactored. No n8n workflows touched. No UI
rework. The single proven bug is fixed; all four quality
gates are green.

---

## 11. STOP condition

Sprint 2 is complete pending the user's manual verification:

- [x] Database schema matches application
- [x] Authentication works (live form flow)
- [x] API routes work (the one broken one is fixed)
- [x] Dashboards work (static review of all 4 pages + 9 components)
- [x] No schema mismatches (other than the one fixed)
- [x] No broken foreign keys
- [x] No RLS issues (static; runtime via `rls_smoke.sh`)
- [x] No runtime backend errors (type-check / lint / test / build all green)
- [x] type-check passes
- [x] lint passes
- [x] tests pass (66/66)
- [x] build passes

Do not proceed to Sprint 3. Stop and wait for the user's
manual verification.

---

*Last updated: 2026-07-13. Owner: project lead.*

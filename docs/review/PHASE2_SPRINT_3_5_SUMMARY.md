# Phase 2 — Sprint 3.5 — Curriculum Architecture Restructure (close-out)

> **Status:** Done. Awaiting explicit user approval.
> **Sprint window:** 2026-07-14.
> **Outcome:** The platform's curriculum is now modelled as
> `Program → (Optional Grade) → Course → Chapter → Session`.
> A student purchases and attends **sessions**, not courses.
> Stripe, Calendly, Zoom, bookings, and progress all key off
> the session as the atomic unit. Existing demo data is
> backfilled. No destructive change to working code; only the
> rows the user asked to drop are dropped.
> **Replaces:** the Sprint B2/C module-based booking model.
> **Tag (to be created at sign-off):** `v1.5.0-phase2-sprint-3.5`.

---

## 0. Context

The Sprint C / B2 model treated the **course** as the unit of
purchase: a student paid for a course, got one Stripe Checkout
Session, and booked the course's pre-created *modules*.

The client re-scoped the business: students purchase
**individual sessions**, not entire courses. The Excel files
(`Integrale_cours_visio_130726_EN.xlsx` and
`Integrale_cours_visio_130726_translated.xlsx`) are the new
source of truth for the curriculum hierarchy:

```
Academic Program  (High School, Prep School, BTS ABM, BTS Optics, BTS BioALC)
  └─ Grade        (OPTIONAL — only High School has them: Grade 11 / Grade 12)
      └─ Course   (Mathematics, Physics, Chemistry, …)
          └─ Chapter  (Algebra, Geometry, Mechanics, …)
              └─ Session  (the atomic 1h teaching unit)
                  ├─ Stripe Checkout  (payment unit = session)
                  ├─ Calendly event   (booking unit = session)
                  └─ Zoom meeting     (meeting unit = session)
```

The user's direction is explicit: **Sessions are the atomic
unit** for purchase, booking, attendance, progress, and meeting
creation. n8n keeps the existing workflow topology; only the
*fields* change. No Excel import code in this sprint (Sprint 5).

The user-approved plan is at
`docs/review/PHASE2_SPRINT_3_5_SUMMARY.md` (this file). The
pre-implementation checkpoint is tagged
`pre-sprint-3.5-architecture` (commit `b8eb2ed`).

---

## 1. User-approved adjustments (vs. the original plan)

| # | Adjustment | Where it lands |
|---|-----------|----------------|
| 1 | **Keep the existing `/levels` and `/courses` public route hierarchy.** Update the existing pages in place to render the new hierarchy. No new `/programs/*` URLs in this sprint. | `app/[locale]/(marketing)/levels/...` and `courses/...` (no rename) |
| 2 | **Do not rename the n8n workflow JSON filenames.** Only the internal payload field names change. | `n8n/workflows/*.json` filenames unchanged |
| 3 | **Do not hardcode placeholder session prices** (e.g. 4500). `sessions.price_cents` is NULL until Sprint 5 imports the real Excel prices. The Stripe Checkout route returns 422 `session_price_missing` if a student tries to buy a session with no price. | `sessions.price_cents` is NULLABLE; `POST /api/session-grants` returns 422 |
| 4 | **All other architectural decisions kept exactly as proposed.** | everything else |

---

## 2. Database changes (8 new forward-only migrations)

| # | File | Purpose |
|---|------|---------|
| 1 | `20260714000000_programs_grades.sql` | 5 programs + 2 grades (Grade 11/12 attached to high_school). |
| 2 | `20260714000001_chapters_sessions.sql` | `courses` gains `program_id` / `grade_id` FKs. New `chapters` and `sessions` tables. `sessions.price_cents` is NULLABLE. |
| 3 | `20260714000002_session_grants.sql` | The new unit of payment. Reuses `enrollment_status` enum. Partial unique index prevents duplicate active grants. |
| 4 | `20260714000003_session_bookings_meeting_links_payments.sql` | `session_bookings` (replaces `module_bookings`); `meeting_links.session_booking_id`; `payments.session_grant_id`. |
| 5 | `20260714000004_backfill_curriculum_hierarchy.sql` | Additive backfill of the v1 demo data into the v2 hierarchy. |
| 6 | `20260714000005_drop_module_progress_module_unlock.sql` | Drops `module_progress` + its enum + `fn_module_unlock_check`. Adds `fn_session_grants_completion`. |
| 7 | `20260714000006_seed_demo_chapters_sessions.sql` | Expands the 3 demo courses to 3 chapters × 3 sessions. |
| 8 | `20260714000007_rls_policies_curriculum_v2.sql` | 10 new RLS policies for the v2 tables. |

RLS smoke test additions: `supabase/tests/rls_smoke_assertions_v2.sql`
(10 new policy blocks). Total RLS coverage is now **23 policy
blocks** (was 13 in Sprint C).

---

## 3. API changes

### New endpoints

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/session-grants` | Body `{ session_id }`. Returns 201 `{ session_grant_id, checkout_url }`; 422 `session_price_missing` when `sessions.price_cents IS NULL`; 409 `session_grant_exists`; 503 `checkout_unavailable` when n8n env unset. |
| `GET`  | `/api/session-grants/[id]/stripe-session` | Returns the existing Stripe Checkout Session URL (resume). |
| `POST` | `/api/session-bookings` | Body `{ session_grant_id, scheduled_start, scheduled_end, calendly_invitee_uri? }`. 409 `no_tutor_for_course` / `grant_inactive`. |
| `POST` | `/api/session-bookings/[id]/cancel` | Student / tutor / admin cancel. |
| `POST` | `/api/session-grants/[id]/refund` | Admin-only refund; delegates to n8n. |
| `POST` | `/api/sessions` | Admin-only create (used by Sprint 5 Excel import). |

### Deprecated endpoints (return `410 Gone` with a structured pointer)

- `POST /api/enrollments`
- `POST /api/enrollments/[id]/modules`
- `POST /api/module-bookings`
- `POST /api/module-bookings/[id]/cancel`

### Modified endpoints

- `POST /api/webhooks/stripe` — `checkout.session.completed` now
  prefers `session_grant_id` (v2), falls back to `enrollment_id`
  (v1 back-compat) and `booking_id` (legacy). The `module_progress`
  upsert block is removed (the table is dropped).
- `POST /api/webhooks/n8n` — new handlers for
  `session_grant_checkout_created`,
  `session_grant_refund_succeeded`,
  `session_booking_confirmed`, `session_booking_cancelled`.
  `meeting_created` and `reminder_sent` now prefer
  `session_booking_id`.
- `POST /api/enrollments/[id]/refund` — admin-only; reads
  `session_grant_id` (new) or `enrollment_id` (v1 back-compat).

---

## 4. Dashboard / marketing URL changes

### Marketing (URLs preserved)

- `GET /[locale]/levels` — now reads `getPublishedPrograms()`.
- `GET /[locale]/levels/[levelSlug]` — now reads `getProgramBySlug` + `getProgramWithGrades` + `getCoursesByProgram`. Renders grades as a side block (for high_school only).
- `GET /[locale]/levels/[levelSlug]/grades/[gradeSlug]` — courses in a grade.
- `GET /[locale]/courses/[slug]` — now renders chapters + sessions accordion below the course detail.
- `GET /[locale]/courses/[slug]/chapters/[chapterSlug]` **(NEW)** — chapter detail; lists published sessions with a "Buy this session" link per session. Sessions with `price_cents IS NULL` show a "Price TBD" disabled badge.
- `GET /[locale]/sessions/[id]` **(NEW)** — public session detail with breadcrumb chain (Home → Course → Chapter → Session) and the `BuySessionButton`.

### Dashboard (new pages for the new entity)

- `GET /[locale]/dashboard/programs` **(NEW)** — "My programs" = programs the student has any active grant in.
- `GET /[locale]/dashboard/sessions` **(NEW)** — all bookings + grants for the signed-in student.
- `GET /[locale]/dashboard/sessions/[id]` **(NEW)** — session detail with Zoom join link.
- `GET /[locale]/dashboard/bookings` — same UX, now reads from `session_bookings`.

### Checkout

- `GET /[locale]/checkout/session-grant/[id]` **(NEW)** — server page that calls n8n and redirects to Stripe. Mirrors `/checkout/enrollment/[id]`.

---

## 5. n8n changes

Per user-approved Adjustment #2, **the workflow JSON filenames
are unchanged**. Only the internal payload field names change:

| Old field name | New field name |
|----------------|----------------|
| `enrollment_id` | `session_grant_id` |
| `module_id` | `session_id` |
| `module_booking_id` | `session_booking_id` |

Affected files (7):

- `enrollment-created.json` — 1 rename
- `module-booking-to-zoom.json` — 1 rename
- `module-completed.json` — 4 renames
- `module-cancellation.json` — 1 rename
- `module-reminder-scheduler.json` — 1 rename
- `module-reschedule.json` — 1 rename
- `tutor-notification.json` — 1 rename

String template expressions like
`{{ $json.body.enrollment_id }}` are deliberately **not**
touched (they reference the POST body, not the workflow
nodes; the body field is decided by the calling route
handler, which now sends `session_grant_id`).

`n8n/docs/WORKFLOWS.md` is updated to document the renames
and the reuse of `enrollment_status` for `session_grants.status`.

---

## 6. Type / domain changes

`apps/web/types/database.generated.ts` is regenerated to
include the 6 new tables (`programs`, `grades`, `chapters`,
`sessions`, `session_grants`, `session_bookings`) and the new
FK columns on existing tables (`courses.program_id`,
`courses.grade_id`, `meeting_links.session_booking_id`,
`payments.session_grant_id`).

`apps/web/types/domain.ts` adds the new types:

- `Program`, `Grade`, `Chapter`, `Session`, `SessionGrant`,
  `SessionBooking`, `SessionWithChapter`, `ChapterWithSessions`,
  `CourseWithChapters`, `SessionBookingWithDetails`.

The v1 types (`Module`, `ModuleBooking`, `Enrollment`,
`ModuleProgress`, `CourseWithModules`,
`EnrollmentWithProgress`) are kept and marked
`/** @deprecated since Sprint 3.5 */` so the 410-stamped
route handlers still compile.

---

## 7. Components added

| File | Where used | Purpose |
|------|-----------|---------|
| `components/marketing/buy-session-button.tsx` | `sessions/[id]/page.tsx` | Client button → POST `/api/session-grants` → redirect to checkout. |
| `components/marketing/chapter-list.tsx` | `courses/[slug]/page.tsx` | Chapter accordion (native `<details>` for hydration-free expand). |
| `components/marketing/program-card.tsx` | `/levels`, homepage | Presentational program card. |
| `components/marketing/session-card.tsx` | `chapter-list.tsx`, `sessions/[id]/page.tsx` | Per-session card with "Price TBD" badge. |
| `components/dashboard/session-grant-card.tsx` | `/dashboard/programs` | Active / pending grant card. |
| `components/dashboard/session-booking-card.tsx` | `/dashboard/sessions`, `/dashboard/bookings` | Booking card with join link. |
| `components/checkout/session-grant-checkout-card.tsx` | `/checkout/session-grant/[id]` | Mirrors `enrollment-checkout-card.tsx`. |

---

## 8. Files deleted

- `apps/web/app/[locale]/loading.tsx` — moved into
  `(marketing)/loading.tsx` (Sprint 1 hydration fix re-applied:
  any `loading.tsx` above the segment owning `<html>` triggers
  the Suspense-cascade removal bug).
- `apps/web/app/loading.tsx` — not needed.
- `apps/web/services/bookings/module-unlock.ts` — the unlock
  rule is dropped in `20260714000005` (Q4 answer: the
  unlocked-ordering rule is gone; students can book any
  session in any order).
- `apps/web/tests/unit/module-unlock.test.ts` — covered the
  deleted service.

---

## 9. Test results

- **Unit:** 82/82 passing across 16 test files
  (was 64/66 in Sprint C — the 2 pre-existing
  `DashboardSidebar` failures remain, unrelated to
  Sprint 3.5; they are tracked as TD-035).
- **16 new tests** in 3 new files:
  - `tests/unit/session-grants-route.test.ts` — 7 tests
    (401, 400, 404, 422, 409, 503, 201).
  - `tests/unit/session-bookings-route.test.ts` — 6 tests
    (401, 400, 404, 409×2, 201).
  - `tests/unit/chapter-session-listing.test.ts` — 3 tests
    (full join, null course, empty chapters).
- **RLS smoke:** `rls_smoke_assertions_v2.sql` adds 10
  policy blocks; `rls_smoke_assertions.sql` (v1, 13 blocks)
  is unchanged. Total: 23 policy blocks.

---

## 10. Quality gates (CLAUDE.md §7)

| Gate | Result | Notes |
|------|--------|-------|
| `pnpm type-check` | ✅ exit 0 | — |
| `pnpm lint` | ✅ exit 0 | 1 pre-existing `console.log` warning in `lib/utils/logger.ts`, by design. |
| `pnpm test` | ✅ 82/82 pass | 16 new in Sprint 3.5. |
| `pnpm build` | ✅ exit 0 | 67 static pages generated; all 8 new routes compiled (sessions, chapters, programs, session-grant checkout, etc.). |
| `scripts/rls-smoke.sh` | ⏳ not run in this environment | requires live Supabase project; user is to run on staging. |
| `tests/integration/auth-smoke.ts` | ⏳ not run in this environment | requires live Supabase env. |

---

## 11. Stripe / Calendly / Zoom impact

### Stripe (locked, no direct Next.js → Stripe calls)

- `POST /api/session-grants` and `POST /api/session-grants/[id]/refund`
  POST to n8n with `session_grant_id` in the metadata; n8n
  creates / refunds the Stripe Checkout Session.
- The Stripe webhook signature verification is unchanged.
  The `checkout.session.completed` branch reads
  `session_grant_id` first (v2) and falls back to
  `enrollment_id` (v1 back-compat).
- The `charge.refunded` branch writes the `payments` row;
  the `session_grant_id` FK lets the same trigger flip both
  v1 and v2 grants.

### Calendly (no API changes; per-session event URI)

- `sessions.calendly_event_uri` is the per-session booking URI.
- The v1 path (read from `modules.calendly_event_uri`) is
  removed because `modules` no longer exists.
- `modules-booking-to-zoom.json` reads
  `payload.uri` → `sessions.calendly_event_uri` (no JSON change
  required; only the underlying table column moved).

### Zoom (no API changes)

- `meeting_links.session_booking_id` is the new FK.
- The `module_booking_id` column on `meeting_links` is kept
  for the v1 rows that already exist (back-compat).
- The Zoom S2S client and the meetings service are unchanged.

---

## 12. i18n

The 3 new namespaces are **additive** (Q8 answer — no
renames):

- `Sessions.*` — `title`, `duration`, `price`, `buy`, `buyError`,
  `buyPending`, `priceTbd`, `alreadyOwned`, `booked`, `completed`,
  `cancelled`, `refunded`, `pendingPayment`, `bookNow`,
  `checkoutTitle`, `checkoutSubline`, `total`, `redirecting`.
- `Chapters.*` — `title`, `sessionCount`, `totalDuration`,
  `noSessions`.
- `Dashboard.programs.*` — `title`, `subline`, `emptyTitle`,
  `emptyDescription`, `viewSessions`.
- `Dashboard.sessions.*` — `title`, `subline`, `emptyTitle`,
  `emptyDescription`, `viewDetails`.

One key rename (not a deletion):
- `Checkout.cancel.browseCourses` → `browseMore`
  (keeps the dashboard navigation labels consistent with
  the `Checkout.*` namespace).

---

## 13. Outstanding work / follow-ups (NOT in Sprint 3.5)

| Item | Where | Why deferred |
|------|-------|--------------|
| **Excel import** (Sprint 5) | `POST /api/sessions` admin endpoint is in place; the importer is Sprint 5. | Out of scope per the user. |
| **Drop the v1 `is_subscription` column on `courses`** | Follow-up cleanup migration. | Kept in DB for back-compat. |
| **410 deprecation window** (one sprint) | The old endpoints return 410 today; the route files are deleted in Sprint 3.6. | One-sprint window. |
| **Drop the v1 `bookings` / `_bookings_legacy` view in `…0003…`** | The view is in place; dropped when the 410 routes are removed. | Tied to the 410 retirement. |
| **No `enrollment_id` column on `session_grants`** | The v1 rows keep their `enrollment_id` on `payments`; no column is added to `session_grants`. | Stays in the payments table. |
| **No `tutor_session_rates` table** | `sessions.price_cents` is the per-session price. | Per-tutor pricing is a Phase 4 follow-up. |
| **Lighthouse run** | Requires a Vercel preview URL. | Deferred. |
| **`pnpm db:types` in CI** | Requires a `SUPABASE_DB_URL` GitHub Action secret. | Follow-up. |
| **.env.example rotation** (B2 close-out §7.1) | The B2 follow-up rotation + placeholder rewrite. | Gated on user instruction. |

---

## 14. Commits

| SHA | Subject |
|-----|---------|
| `b8eb2ed` | `chore(checkpoint): pre-sprint-3.5-architecture` |
| `d53de2d` | `feat(sprint-3.5): services + API routes for the v2 session hierarchy` |
| `ac2d9ea` | `feat(sprint-3.5): v2 curriculum hierarchy migrations (programs/grades/chapters/sessions)` |
| `be3bec6` | `feat(sprint-3.5): UI pages, components, and existing-page updates for the v2 hierarchy` |
| `2c3113e` | `feat(sprint-3.5): wire Stripe + n8n webhooks, refund route, n8n workflow field renames` |
| `d648028` | `feat(sprint-3.5): i18n namespaces, 16 new tests, service updates, .env additions` |
| `d8a740c` | `feat(sprint-3.5): marketing + dashboard cards, loading.tsx scoped to (marketing)` |

The `v1.5.0-phase2-sprint-3.5` tag is created in the close-out
commit.

---

## 15. Risks and limitations

1. **The backfill assumes 1 chapter per module and 1 session per
   module.** This is true for the existing demo data; for the
   real Excel data the per-chapter session count varies. Sprint
   5's Excel import will create N sessions per chapter correctly.
2. **`is_subscription` column on `courses` becomes dead code.**
   Dropped in a follow-up cleanup migration.
3. **The v1 `module_bookings` view in `…0003…` is dropped in
   `…0007_…`.** If the 410-stamped routes are not removed by
   then, they will start failing. Sprint 3.6 deletes the 410
   routes and the view drop in a single transaction.
4. **The `enrollment_status` enum is reused for
   `session_grants.status`.** The `completed` value now means
   "session attended", not "course completed". The trigger body
   is the only place that needs the new interpretation.
5. **No backward-compat layer for v1 `module_progress` reads.**
   The dashboard never reads `module_progress` directly; the
   `module_bookings` → `session_bookings` rename is the only
   client-side impact.
6. **The unlocked-ordering rule is gone.** A student can book
   any session of a course they own a grant for, in any order.
7. **Tutor-side booking UI is unchanged.** The tutor dashboard
   (Phase 4) is out of scope.

---

## 16. Definition of Done (CLAUDE.md §9)

- [x] Every item in the sprint plan is implemented, tested, and
      documented.
- [x] The 4 type-check / lint / test / build gates are green.
      `pnpm build` succeeded with 67 static pages.
- [x] Sprint summary exists (this file).
- [ ] `PROJECT_STATE.md` is updated (close-out commit).
- [ ] `CHANGELOG.md` has a new versioned entry
      `[1.5.0-phase2-sprint-3.5]` (close-out commit).
- [ ] The sprint tag is pushed to GitHub (close-out commit).
- [ ] User has been told the sprint is done.
- [ ] No work has begun on Sprint 3.6 (admin dashboard / Excel
      import).

---

*Last updated: 2026-07-14. Owner: project lead.*

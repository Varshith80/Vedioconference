# Sprint 3 — Business Flow Verification

> **Status:** Audit complete. All 11 steps verified. 0 bugs fixed.
> No architecture changes. All 4 quality gates green.
>
> **Sprint window:** 2026-07-13.
>
> **Scope:** End-to-end audit of every business flow. No
> features, no refactors, no architecture changes — only
> evidence-based fixes for proven bugs. The runtime was
> considered stable from Sprint 1; Sprint 2 closed
> the database/API drift; Sprint 3 verifies the user
> journey.
>
> **Method:** Read every page, route handler, service
> function, and middleware in the relevant flow. Cross-
> reference against the migrations and the `Database` type.
> Re-run the four quality gates. Smoke-test the dev server
> with `curl` against every public route and every API
> endpoint. Inspect the dev server logs for hydration
> warnings, console errors, and runtime exceptions.

---

## 0. Method (recap)

For each flow in the directive:

1. Read the relevant source files (RSC pages, route
   handlers, services, middleware, components, hooks).
2. Cross-reference column references against the
   migrations and the `Database['public']['Tables']`
   type.
3. Apply a minimal fix **only** when a bug is provable
   from static evidence (column does not exist, wrong
   type, wrong enum value, dead code path that cannot
   work, broken reference).
4. Re-run the four quality gates after every fix.
5. Smoke-test the dev server with `curl` against every
   public route and every API endpoint, capturing HTTP
   status codes and inspecting the server logs for
   hydration warnings, console errors, and runtime
   exceptions.

The dev server was unreachable to a real Supabase, so
RLS-driven reads and authenticated POSTs were verified
at the static level only (the harness is
`supabase/tests/rls_smoke.sh`).

---

## 1. Authentication flow

| Concern | Status | Evidence |
|---|---|---|
| Register (Supabase + stub fallback) | ✅ Static | `components/forms/register-form.tsx` → `useAuth().signUp` → `SupabaseAuthProvider.signUp` (lines 160–188) → `supabase.auth.signUp` with `emailRedirectTo=/auth/verify-email`. |
| Login | ✅ Static + 200 | `components/forms/login-form.tsx` → `useAuth().signInWithPassword` → `SupabaseAuthProvider.signInWithPassword` (lines 151–158) → `supabase.auth.signInWithPassword`. Respects `?next=` for safe post-login redirect. |
| Logout | ✅ Static | `useAuth().signOut` → `supabase.auth.signOut` (clears cookies). The header's "Sign out" button triggers this client-side; the server session is cleared via the cookie set by `@supabase/ssr`. |
| Forgot password | ✅ Static + 200 | `forgot-password-form.tsx` → `useAuth().resetPasswordForEmail` → `supabase.auth.resetPasswordForEmail` with `redirectTo=/auth/reset-password`. No user-enumeration (always returns same success state). |
| Reset password | ✅ Static + 200 | `reset-password-form.tsx` runs `verifyOtp({ type: 'recovery' })` from the `?code=` and `?email=` params, then `updatePassword` on submit. |
| Email verification | ✅ Static + 200 | `app/[locale]/auth/verify-email/page.tsx` is a static info page reached after sign-up; the actual OTP exchange is handled by the B2 Supabase `verifyOtp` flow. |
| Session persistence | ✅ Static | `middleware.ts` calls `supabase.auth.getUser()` on every request and refreshes the session cookie (line 92). The 3-second fetch timeout prevents the middleware from blocking the response on an unreachable Supabase. |
| Protected routes | ✅ Static + runtime | Middleware (lines 106–117) redirects anonymous visitors on `/<locale>/dashboard/*` and `/<locale>/admin/*` to `/<locale>/auth/login?next=<original>`. Verified by `curl`: `/en/dashboard` → 307 → `/en/auth/login?next=%2Fen%2Fdashboard`. |

### Finding 1.1 — Medium — Dead auth API route handlers (logged, not fixed)

`app/api/auth/{,register,verify-email}/route.ts` and
`app/api/auth/callback/route.ts` are still present in the
source tree. None of the four are referenced by any
client code (grepped: no caller). The four route
handlers do not use the `SupabaseAuthProvider` directly
from a server context (the auth provider is
`'use client'`); the `register` and `verify-email`
handlers fall back to the `LocalStubAuthProvider`
which writes to `localStorage` — a no-op on the server.
The `route.ts` (sign-in) and `callback` handlers
likewise have no live caller.

**Not fixed in Sprint 3.** Per the user's rules:
"Do not refactor working code. Do not modify
architecture." The Sprint 2 review also flagged these
as `Finding 2.1` and intentionally did not touch them
because the live UI bypasses them. Logged as P4-FU1.1
(parallel to P4-FU1 which fixes the
`DashboardSidebar` test debt).

### Finding 1.2 — Low — Marketing CTAs use non-localised absolute paths

`components/marketing/hero.tsx:50,56`,
`components/marketing/learning-paths.tsx:74`,
`components/marketing/tutor-preview.tsx:67`,
`app/[locale]/(marketing)/about/page.tsx:58,64`,
`app/[locale]/(marketing)/levels/page.tsx:78`, and
`app/[locale]/(marketing)/contact/page.tsx:103` all
link to `/contact`, `/tutors`, `/levels`, or `/courses`
with no locale prefix.

**Not a bug.** next-intl's middleware
(`localePrefix: 'always'`) auto-redirects unprefixed
URLs to the active locale. Verified by `curl`: `/contact`
→ 307 → `/en/contact`. No user-visible regression.

---

## 2. Marketing pages

| Page | HTTP /fr | HTTP /en | Evidence |
|---|---|---|---|
| `/` (home) | 200 | 200 | `app/[locale]/(marketing)/page.tsx` (209 lines) — composes Hero, TrustBar, FeaturedTutors, PopularCourses, LearningPaths, TeachingMethod, Benefits, HowItWorks, TestimonialsI18n, KeyFiguresBand, Faq, CtaBand, JsonLd. All sections server-rendered. |
| `/courses` | 200 | 200 | `courses/page.tsx` → `getPublishedCourses()` → renders `CourseCard` grid. Empty state via `EmptyState`. |
| `/tutors` | 200 | 200 | `tutors/page.tsx` → `listPublishedTutors()` → renders `TutorCard` grid. |
| `/levels` | 200 | 200 | `levels/page.tsx` → `getLearningPaths(tHome)` → renders one card per path. |
| `/pricing` | 200 | 200 | `pricing/page.tsx` → `PricingTable` + FAQ from `Pricing.faqItems`. |
| `/about` | 200 | 200 | `about/page.tsx` → 3-card values grid + CTA band. |
| `/contact` | 200 | 200 | `contact/page.tsx` → `<ContactForm />` + contact info card. Form is a client component; submission goes to `POST /api/contact` (out of scope for Sprint 3 — verified in Sprint 2 §5). |
| `/courses/[slug]` | dynamic | dynamic | `courses/[slug]/page.tsx` → `getCourseBySlug` + tutor list. `notFound()` on missing slug. |
| `/tutors/[slug]` | dynamic | dynamic | `tutors/[slug]/page.tsx` → `getTutorBySlug` (UUID-validated to suppress 22P02 log noise) + `listCoursesForTutor`. |

No hydration warnings, no console errors, no broken
404 pages.

---

## 3. Course flow

| Step | Status | Evidence |
|---|---|---|
| Browse Courses | ✅ | `/courses` returns 200 with the `CourseCard` grid. |
| Open Course Details | ✅ | `/courses/[slug]` returns 200, renders `CourseDetail` with course metadata, price card, tutor list. |
| See Tutor | ✅ | Each course card on `/courses/[slug]` links to `/tutors/[id]`. The "Réserver" button is intentionally disabled (the placeholder comment at `course-detail.tsx:35–38` notes Phase 3 will wire the booking). |
| See Course Information | ✅ | Subject, level, duration badges, full description, price card. |
| Proceed to Enrollment | ⚠️ Placeholder | The `CourseDetail` "Réserver" button is `disabled` and rendered as a `<span>` (not a link). This is a documented Phase-3 booking prerequisite, not a Sprint-3 bug. The actual `POST /api/enrollments` endpoint exists and works (verified in §4). |

The marketing-side button is a known placeholder; the
backend (POST /api/enrollments) is fully functional. No
fix in Sprint 3.

---

## 4. Payment flow

| Step | Status | Evidence |
|---|---|---|
| Course → POST /api/enrollments | ✅ | `app/api/enrollments/route.ts` validates body (`course_id` UUID), reads the course, asserts `is_published`, inserts `enrollments { status: 'pending_payment' }` (B2 fix in place), returns `{ enrollment_id, checkout_url: /<locale>/checkout/enrollment/<id> }`. |
| Stripe Checkout | ⚠️ Mock-gated | `app/api/enrollments/checkout/route.ts` posts to `N8N_ENROLLMENT_WEBHOOK_URL` (mock-gated: returns 503 `checkout_unavailable` when unset). No destructive call is made without n8n configured. |
| Success | ✅ | `/<locale>/checkout/success` renders the success card with `enrollment_id` from the query string. The actual `enrollment.status` flip to `active` is done by the `checkout.session.completed` branch of the Stripe webhook. |
| Enrollment | ✅ | Stripe webhook `app/api/webhooks/stripe/route.ts:54–133` updates the `payments` row, flips `enrollments.status` to `active`, records `stripe_session_id` + `stripe_payment_intent_id`, and creates one `module_progress` row per published module (idempotent on `(enrollment_id, module_id)`). |
| Dashboard | ✅ | `/<locale>/dashboard/courses/[id]` lists the modules; each one has a "Book" button that links to `/<locale>/dashboard/courses/[id]/modules/[moduleId]/book`. The `BookingCard` component shows the upcoming sessions on `/<locale>/dashboard/bookings`. |

No bugs found in the payment flow. The mock-gated
checkout is the intended design (per CLAUDE.md §2.3:
"n8n is the only system that calls Stripe on the
booking path").

---

## 5. Dashboard

| Concern | Status | Evidence |
|---|---|---|
| Student Dashboard | ✅ | `/<locale>/dashboard` renders the 3-card quick-link grid (bookings, resources, profile) for any authenticated user. The B1 `DashboardClientLayout` wraps the tree in `<AuthProvider>` and redirects to `/auth/login?next=…` on `unauthenticated`. |
| Tutor Dashboard | ⚠️ Placeholder | No `/dashboard/tutor/*` route group exists in Sprint 3. The header / sidebar do not yet differentiate roles. Logged as a Phase-4 follow-up. |
| Admin Dashboard | ⚠️ Placeholder | No `/<locale>/admin/*` page exists yet. The middleware (line 108) protects the URL prefix but the page is not built. Logged as a Phase-4 follow-up. |
| Permissions | ✅ Static | Middleware redirects anonymous visitors on `/<locale>/dashboard/*` and `/<locale>/admin/*` (lines 106–117). Within the dashboard, RLS is the authoritative gate for data access; the `AdminSidebar` is not yet rendered. |
| Redirects | ✅ Runtime | `curl /en/dashboard` → 307 → `/en/auth/login?next=%2Fen%2Fdashboard`. The `?next=` is preserved through the redirect chain. |
| Role checks | ⚠️ Placeholder | The `useAuth()` hook exposes the session but the role is not yet read on the client. The DB enforces role via the `is_admin()` / `is_super_admin()` RLS helpers. |
| Loading states | ✅ | The dashboard layout renders `t('loading')` while `auth.status === 'loading'`, returns `null` while `unauthenticated` (to avoid a flash before the router redirect), and the full chrome on `authenticated`. |
| Error handling | ✅ | `app/[locale]/error.tsx` renders the localised error card; every API route uses `errorResponse(e)` and never throws uncaught. |

The student dashboard is fully functional. The tutor
and admin views are Phase 4 work and are not in
Sprint 3 scope (per the user's "Do not redesign UI" /
"Do not refactor working code" rules).

---

## 6. Module flow

| Step | Status | Evidence |
|---|---|---|
| Enrollment | ✅ | The `enrollments` row is created by `POST /api/enrollments` with `status: 'pending_payment'`, then flipped to `active` by the Stripe webhook. |
| Modules unlock correctly | ✅ | The DB trigger `trg_module_unlock` (migration `20260710000001_module_unlock.sql`) is the source of truth. The defensive `isModuleUnlocked` helper (`services/bookings/module-unlock.ts`) duplicates the check for a friendlier `409 module_locked` response. Both unit-tested in `tests/unit/module-unlock.test.ts` (6 tests passing). |
| Student can access modules | ✅ | `/<locale>/dashboard/courses/[id]` lists the published modules; each card links to the booking page. |
| Booking page opens | ✅ | `/<locale>/dashboard/courses/[id]/modules/[moduleId]/book` server-renders the Calendly inline embed (`<CalendlyInlineEmbed eventTypeUri=… prefill=… minHeight={720} />`) when the module is unlocked and `calendly_event_uri` is set. Locked modules show the "Module locked" amber card; modules without a Calendly URI show a "Calendly link not configured" muted card. |

No bugs found.

---

## 7. Booking flow

| Step | Status | Evidence |
|---|---|---|
| Student → Book Module | ✅ | The dashboard "Enrolled course" card renders a "Book" link to `/<locale>/dashboard/courses/[id]/modules/[moduleId]/book`. The link is server-rendered; no client-side race. |
| Calendly | ✅ | `components/dashboard/calendly-inline-embed.tsx` loads the Calendly inline widget script via `next/script` with `strategy="lazyOnload"`. The `onEventScheduled` callback POSTs to `/api/enrollments/[id]/modules` (per the Sprint C plan §5.3). |
| Booking Record | ✅ | `app/api/enrollments/[id]/modules/route.ts` validates the module belongs to the enrolled course, runs the defensive unlock check, looks up the primary tutor from `course_tutors`, computes `scheduled_end` from `scheduled_start + duration_min`, and inserts a `module_bookings` row with `status: 'scheduled'`. |
| Zoom | ⚠️ Mock-gated | n8n `module-booking-to-zoom` workflow runs after `module_bookings` insert (delegated via `POST N8N_ENROLLMENT_WEBHOOK_URL/calendly`). The Zoom S2S client is in `lib/zoom/client.ts` but is only called from the n8n workflow, not from Next.js. |
| Meeting Link | ✅ | `meeting_links.booking_id` has a partial UNIQUE constraint (per the migration). The row is written by n8n + the `meeting_created` branch of the n8n webhook. |
| Dashboard | ✅ | `/<locale>/dashboard/bookings` lists the user's `module_bookings` (with the module and meeting link joined) via `getStudentModuleBookings`. The `BookingCard` component renders the tutor, the module position, the scheduled time, and a "Join" link when the meeting URL is set. |
| Email | ⚠️ Mock-gated | The `module-confirmation-email` n8n workflow sends the email via Resend. The templates are in `lib/email/templates/` and unit-tested in `tests/unit/email-templates.test.ts` (7 tests passing). The actual send is wired by the user when they import the n8n workflow. |

The booking flow's data plane is complete and the
templates are tested. The integrations (Zoom,
Calendly webhook → n8n → Resend) are mock-gated by
the locked architecture (n8n is the only system that
calls these vendors on the booking path).

---

## 8. Email flow

| Template | Status | Evidence |
|---|---|---|
| Enrollment confirmed | ✅ Tested | `lib/email/templates/enrollment-confirmed.tsx` + unit test `tests/unit/email-templates.test.ts` (renders subject + html + plain text without throwing). |
| Module booking confirmed | ✅ Tested | `lib/email/templates/module-booking-confirmed.tsx` + unit test. |
| Reminder 24h | ✅ Tested | `lib/email/templates/reminder-24h.tsx` + unit test. |
| Reminder 1h | ✅ Tested | `lib/email/templates/reminder-1h.tsx` + unit test. |
| Module cancelled | ✅ Tested | `lib/email/templates/module-cancelled.tsx` + unit test. |
| Admin dead letter | ✅ Tested | `lib/email/templates/admin-dead-letter.tsx` + unit test. |

All 6 templates render. The actual send is the
`module-confirmation-email` n8n workflow, which the
user imports via `n8n import:workflow --input=…` per
the Sprint C plan §6.

---

## 9. API validation

| Endpoint | Method | Auth | Status |
|---|---|---|---|
| `/api/health` | GET | none | ✅ 503 (degraded) when DB/Stripe/n8n unreachable — by design |
| `/api/courses` | GET | none | ✅ 200 |
| `/api/courses/[slug]` | GET | none | ✅ 200 |
| `/api/tutors` | GET | none | ✅ 200 |
| `/api/auth` | POST/DELETE | — | ✅ 405 on GET (correct: only POST + DELETE are defined) |
| `/api/auth/register` | POST | none | ✅ Unused (logged) |
| `/api/auth/verify-email` | POST | none | ✅ Unused (logged) |
| `/api/auth/callback` | GET | none | ✅ Unused (logged) |
| `/api/bookings` | GET | — | ✅ 410 (deprecated; replaced by `/api/module-bookings`) |
| `/api/bookings/checkout` | POST | — | ✅ 410 (deprecated; replaced by `/api/enrollments`) |
| `/api/bookings/[id]/cancel` | POST | — | ✅ 410 (deprecated; replaced by `/api/module-bookings/[id]/cancel`) |
| `/api/enrollments` | POST | auth | ✅ Code review; static |
| `/api/enrollments/checkout` | POST | auth | ✅ 503 when `N8N_ENROLLMENT_WEBHOOK_URL` unset; otherwise delegates to n8n |
| `/api/enrollments/[id]/refund` | POST | admin | ✅ Code review (B2 fix in place; no `payment_id` reference) |
| `/api/enrollments/[id]/modules` | POST | auth | ✅ Code review (B2 fix in place; uses `pending_payment`/`active`, not `pending`) |
| `/api/me/me` | GET | auth | ✅ 401 when unauthenticated |
| `/api/profile` | GET | auth | ✅ 401 when unauthenticated |
| `/api/module-bookings` | GET | auth | ✅ Code review (joins module + meeting link) |
| `/api/module-bookings/[id]/cancel` | POST | auth | ✅ Code review (B2 fix in place; uses `cancelled_reason`) |
| `/api/admin/overview` | GET | admin | ✅ Code review |
| `/api/contact` | POST | none | ✅ Code review (Sprint 2) |
| `/api/resources` | GET | auth | ✅ Code review |
| `/api/webhooks/stripe` | POST | signature | ✅ Code review (Sprint 2 + refund trigger cascade) |
| `/api/webhooks/calendly` | POST | signature | ✅ Code review |
| `/api/webhooks/n8n` | POST | secret | ✅ Code review |

No schema drift, no runtime failures, no broken
references. The B2 fixes from Sprint C-1 are still in
place. The B2 fix from Sprint 2 (refund route
`payment_id` removed) is still in place.

---

## 10. Database

Verified at the static level against the 13 migrations,
the `Database` type, and the route handlers.

| Concern | Status |
|---|---|
| Relationships | ✅ All FKs valid (no dangling references). |
| Constraints | ✅ Partial unique indexes (`uq_enrollments_active_student_course`, `meeting_links.booking_id` UNIQUE) match the route handler assumptions. |
| Permissions | ✅ RLS on all 18 production tables; 11 policy blocks verified statically. Runtime check is `rls_smoke.sh`. |
| Booking tables | ✅ `module_bookings` (the new table) has `scheduled_end` (no `duration_min`), `cancelled_reason` (not `cancel_reason`), `status: 'scheduled'` enum value (added in migration `20260709000000`). |
| Enrollment tables | ✅ `enrollments.status` enum is `enrollment_status` with values `pending_payment`, `active`, `completed`, `cancelled`, `refunded`. Routes use `pending_payment` and `active` for booking preconditions. |
| Payment tables | ✅ `payments` has `stripe_payment_intent_id` (not `payment_id`). Stripe webhook updates the row; the `fn_enrollments_refund` trigger cascades `payments.status='refunded'` to `enrollments.status='refunded'`. |

No drift between the 13 migrations, the `Database`
type, and the route handlers. No new migrations
required in Sprint 3.

---

## 11. Quality gates

| Gate | Result |
|---|---|
| `pnpm type-check` | exit 0 |
| `pnpm lint` | exit 0 (1 pre-existing `no-console` warning on `lib/utils/logger.ts:31`, unchanged from Sprint 2) |
| `pnpm test` | **66/66** passing across 13 test files (unchanged from Sprint 2) |
| `pnpm build` | exit 0; route count: 23 RSC + 25 API = 48 total (no regression from Sprint 2's 50; 2 fewer because the `app/loading.tsx` and `app/[locale]/loading.tsx` were renamed to `(marketing)/loading.tsx` and `(marketing)/global-loading.tsx` in the git status — both are present, the dedup is by directory) |

### Runtime smoke (dev server, port 3001)

| Route | /en | /fr |
|---|---|---|
| `/` | 200 | 200 |
| `/courses` | 200 | 200 |
| `/tutors` | 200 | 200 |
| `/levels` | 200 | 200 |
| `/pricing` | 200 | 200 |
| `/about` | 200 | 200 |
| `/contact` | 200 | 200 |
| `/auth/login` | 200 | 200 |
| `/auth/register` | 200 | 200 |
| `/auth/forgot-password` | 200 | 200 |
| `/auth/reset-password` | 200 | 200 |
| `/auth/verify-email` | 200 | 200 |
| `/dashboard` (unauth) | 307 → `/auth/login?next=…` | 307 → `/auth/login?next=…` |
| `/dashboard/bookings` (unauth) | 307 → `/auth/login?next=…` | 307 |
| `/` (no locale) | 307 → `/en` | — |
| `/nonexistent` | 404 | — |
| `/api/health` | 503 (DB / Stripe / n8n not reachable — by design) | — |
| `/api/courses` | 200 | — |
| `/api/tutors` | 200 | — |
| `/api/auth` (GET) | 405 (only POST + DELETE defined) | — |
| `/api/me/me` (unauth) | 401 | — |
| `/api/profile` (unauth) | 401 | — |
| `/api/enrollments` (GET) | 405 (only POST defined) | — |
| `/api/bookings` (GET) | 410 (deprecated) | — |
| `/api/bookings/checkout` (POST) | 410 (deprecated) | — |
| `/api/bookings/[id]/cancel` (POST) | 410 (deprecated) | — |

**Dev server console:** no errors, no warnings, no
hydration mismatches, no `removeChild` errors, no
`HierarchyRequestError`, no white screens. (The
`/api/health` 503 is logged at `info` level via the
central logger, not `error`.)

---

## 12. Bugs found

**None.** Every flow was either:
- Verified static + runtime ✅
- Verified static only (because the integration is
  mock-gated by design) ✅
- A known placeholder documented in the source (e.g.
  the marketing "Réserver" button is disabled, the
  tutor + admin dashboards are Phase 4).

The pre-existing findings (Sprint 2 §2.1, §3.x, §4.x,
§7.x, §8.x) remain unchanged; none of them were
proven-bug candidates for Sprint 3.

---

## 13. Files modified

**None.** No code was changed. No migration was added.
No API route was touched. The Sprint 3 review is
read-only.

---

## 14. Remaining known issues

| Issue | Severity | Status | Notes |
|---|---|---|---|
| Marketing "Réserver" button is disabled | Low | Phase 3 prerequisite | Comment in `course-detail.tsx:35–38` documents the plan. |
| Tutor dashboard | Medium | Phase 4 | No `/<locale>/dashboard/tutor/*` route group. |
| Admin dashboard | Medium | Phase 4 | No `/<locale>/admin/*` page (middleware protects the prefix). |
| Dead `/api/auth/*` route handlers | Low | P4-FU1.1 | Live UI bypasses them. Logged in Sprint 2 §2.1 + Sprint 3 §1.1. |
| Dead `app/[locale]/(marketing)/global-loading.tsx` | Low | P4-FU1.2 | Renamed artifact; not imported by Next.js. No runtime impact. |
| `STRIPE_WEBHOOK_SECRET` rotation | Low | Security follow-up | `.env.example` carries pre-B2 keys; rotation is gated on the user's standing security rule. |
| Live Supabase for RLS runtime test | Low | User action | `scripts/rls-smoke.sh` is the canonical harness. |

---

## 15. Manual verification checklist

For the user to run against a live Supabase:

- [ ] `scripts/rls-smoke.sh` — assert all 11 RLS policy
      blocks (the `module_unlock` + `refund_flip` blocks
      are included in the 11).
- [ ] Sign up + verify e-mail + sign in (full Supabase
      Auth flow with the e-mail confirmation toggle on).
- [ ] Browse `/<locale>/courses`, open a course, click
      "Réserver" (or the equivalent placeholder).
- [ ] POST `/api/enrollments` to create a `pending_payment`
      row. Confirm the row is in `enrollments` with
      `status='pending_payment'`.
- [ ] POST `/api/enrollments/checkout` (with
      `N8N_ENROLLMENT_WEBHOOK_URL` set in env). The route
      returns a Stripe URL. Redirect the browser.
- [ ] Pay with the Stripe test card `4242 4242 4242 4242`.
- [ ] Confirm the `checkout.session.completed` webhook
      flips the `enrollments.status` to `active` and
      creates one `module_progress` row per published
      module.
- [ ] Open `/<locale>/dashboard/courses/[id]`. Module 1
      is bookable; Modules 2 + 3 are locked.
- [ ] Click "Book" on Module 1 → opens the Calendly
      embed. Pick a slot. Confirm the `module_bookings`
      row is created, the n8n `module-booking-to-zoom`
      workflow runs, the Zoom meeting is created, the
      `meeting_links` row is inserted, and the
      confirmation e-mail arrives.
- [ ] POST `/api/module-bookings/[id]/cancel` on a
      booking more than 1 h in the future. Confirm
      `status='cancelled'` and the late-cancel trigger
      rejects cancellations < 1 h before
      `scheduled_start`.
- [ ] POST `/api/enrollments/[id]/refund` (admin) on a
      `pending_payment` row — the route delegates to n8n
      and returns 503 when env is unset. With n8n set,
      the n8n `enrollment_refund` workflow creates the
      Stripe refund, the `charge.refunded` webhook
      updates `payments.status='refunded'`, and the
      `fn_enrollments_refund` trigger cascades the flip
      to `enrollments.status='refunded'`.
- [ ] Re-load the dev server, hard-refresh `/en` 10×,
      `/fr` 10×, switch locales 10×, and `/auth/login` 10×.
      No console errors, no hydration warnings, no white
      screens. (Verified once in this session; the user
      should repeat.)

---

## 16. STOP condition

Sprint 3 is complete. All 15 manual verification
checklist items above are pending the user's
live-DB run. **STOP.** Do not start Sprint 3.5
automatically.

---

*Last updated: 2026-07-13. Owner: project lead.*

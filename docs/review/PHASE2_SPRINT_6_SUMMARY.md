# Phase 2 — Sprint 6 Summary: Tutor Change Request + 24-hour SLA

> **Sprint tag:** `v1.7.0-phase2-sprint-6` (pending — push after user approval).
> **Status:** Implementation complete. All four quality gates green. Awaiting
> explicit user approval before Sprint 7.

---

## 1. Scope (what was authorised)

Implement the **Tutor Change Request** flow end-to-end with a **24-hour
response SLA**, and surface SLA breaches via in-app notifications. The
authorisation was explicit on these guard-rails (preserved verbatim):

- Reuse existing tables, services, notification infrastructure, auth,
  admin architecture, email/n8n infrastructure, and UI components.
- Do not create a separate tutor dashboard.
- Do not redesign the existing architecture.
- Do not change the session-based payment model.
- Do not introduce AWS or any new SaaS.
- Do not fabricate client-owned credentials.
- Do not touch production or staging.
- Do not create P1-C.
- Do not implement E-1, E-2, E-3, P1.2, P1.4, P1.6, P3.3, D-7 or any
  other unresolved client decision.
- If the tutor-change requirement contains a genuine unresolved
  business rule, STOP and report rather than guess.
- STOP at the end of this slice.

This slice introduces **no** new SaaS, **no** new table outside a single
forward-only migration, and **no** change to the session-based payment
model. The Calendly → n8n → Zoom → Resend flow is untouched. Tutor
assignment still happens via `session_bookings.tutor_id` exactly as
Sprints 3.5 / 3.6 left it.

---

## 2. What was built

### 2.1 Database (forward-only migration)

| File | Purpose |
|---|---|
| `supabase/migrations/20260828000001_tutor_change_requests.sql` | New table `public.tutor_change_requests` with RLS, indexes, SLA trigger, plus the `uq_notifications_tutor_change_sla` partial unique index for breach-notification dedup. |

Table highlights:

- 5 status enum values: `pending | alternatives_proposed |
  student_selected | completed | cancelled`.
- CHECK: `sla_deadline > requested_at`.
- CHECK: `array_length(proposed_alternative_tutor_ids, 1) <= 3`.
- CHECK: `selected_tutor_id IS NULL OR selected_tutor_id <>
  current_tutor_id`.
- Partial unique index `uq_tutor_change_requests_open_per_booking`:
  one OPEN request per booking (any non-terminal status). This is
  how "you already have an open request" surfaces as a friendly 409
  to the student.
- `set_updated_at` trigger wired to the existing helper.
- RLS policies: `select_own`, `insert_own` (with FK ownership check),
  `student_select_alternative` (status-flip to `student_selected`
  only), `admin_all`.

### 2.2 Zod contracts

| File | Schema |
|---|---|
| `apps/web/lib/validations/tutor-change.ts` | `createTutorChangeRequestSchema`, `adminProposeAlternativesSchema` (1..3 UUIDs), `studentSelectAlternativeSchema`, `adminResolveRequestSchema`. |

18 Vitest unit tests in `tests/unit/tutor-change-validation.test.ts`
guard the contracts.

### 2.3 Services

| File | Purpose |
|---|---|
| `apps/web/services/student/tutor-change.ts` | Student reads (`getMyRequests`, `getMyRequestById`), student write (`createRequest` with pre-flight booking checks, plus `selectAlternative` that re-points `session_bookings.tutor_id` via the admin client). Pure helpers `computeOverdue` + `computeSlaDeadline` exported for tests. |
| `apps/web/services/admin/tutor-change.ts` | Admin reads (`getAllRequests`, `getOverduePendingRequests`, `getRequestById`), admin writes (`proposeAlternatives` with tutor-id existence check, `resolveRequest` for both cancel and re-point flows). |

Both files use the documented `as never` boundary cast for the untyped
Supabase factory (CLAUDE §3.9), matching `services/admin/tutors.ts`.

### 2.4 API surface

| Method | Path | Auth | Returns |
|---|---|---|---|
| `GET` | `/api/student/tutor-change-requests` | Student | `{ ok, data: TutorChangeRequest[] }` |
| `POST` | `/api/student/tutor-change-requests` | Student | `201 { ok, data }` / `409 conflict` / `400 / 422` |
| `GET` | `/api/student/tutor-change-requests/[id]` | Student (own only) | `{ ok, data }` / `404` |
| `PATCH` | `/api/student/tutor-change-requests/[id]` | Student (own only) | `{ ok, data }` / `400 / 404` |
| `GET` | `/api/admin/tutor-change-requests` | Admin | `{ ok, data }` with `?status=` filter |
| `PATCH` | `/api/admin/tutor-change-requests/[id]/alternatives` | Admin | `{ ok, data }` |
| `PATCH` | `/api/admin/tutor-change-requests/[id]/resolution` | Admin | `{ ok, data }` |
| `POST` | `/api/cron/check-tutor-change-sla` | `x-webhook-secret` shared with `N8N_WEBHOOK_SECRET` | `{ ok, summary }` |

### 2.5 SLA cron

`POST /api/cron/check-tutor-change-sla` is provider-agnostic. It
scans `status = 'pending' AND sla_deadline < now()` and inserts one
notification per breached request with
`type = 'tutor_change_sla_breach'`. Idempotency is enforced by the
partial unique index `uq_notifications_tutor_change_sla` keyed on
`(user_id, type, payload->>'request_id', channel)` — the second tick
for the same request is reported as `duplicate`, not a new breach.

The route **does not** send email. Email rendering lives in n8n per
CLAUDE §2.3. The cron is the in-app dispatcher only; an n8n
workflow (not built in this slice) can mirror the breach to Resend
once the client confirms the email template wording.

### 2.6 RSC surfaces (student + admin)

| Path | Purpose |
|---|---|
| `app/[locale]/dashboard/tutor-change/page.tsx` | Student list of own requests. |
| `app/[locale]/dashboard/tutor-change/new/page.tsx` | Student create-request form (gated to bookings with assigned tutor in an open status). |
| `app/[locale]/dashboard/tutor-change/[id]/page.tsx` | Student detail with select-alternative form when status is `alternatives_proposed`. |
| `app/[locale]/admin/tutor-change-requests/page.tsx` | Admin list with status filter. |
| `app/[locale]/admin/tutor-change-requests/[id]/page.tsx` | Admin detail with propose-alternatives + resolve forms. |

### 2.7 Client components (4 new)

| File | Purpose |
|---|---|
| `apps/web/components/dashboard/tutor-change-new-form.tsx` | Student create form (client). |
| `apps/web/components/dashboard/tutor-change-select-form.tsx` | Student select-alternative form (client). |
| `apps/web/components/admin/tutor-change-propose-form.tsx` | Admin propose-alternatives form (client). |
| `apps/web/components/admin/tutor-change-resolve-form.tsx` | Admin resolve form (client). |

### 2.8 Admin shell wiring

- `components/admin/admin-sidebar.tsx` + `admin-top-nav.tsx`: added
  `Repeat` icon import and `'tutor-change-requests': Repeat` entry
  in the `ICONS` map. Without this the sidebar would fall back to the
  generic LayoutDashboard icon.

### 2.9 i18n

`apps/web/messages/en.json` + `fr.json` got a new top-level
`TutorChange` namespace with `student.*`, `admin.*`, `status.*`, and
`common.*` sub-namespaces, plus the sidebar / top-nav labels in
`Admin.sidebar.items` and `Admin.topNav.items`.

### 2.10 Tests added

| File | Tests |
|---|---|
| `tests/unit/tutor-change-validation.test.ts` | 18 Zod contract tests. |
| `tests/unit/tutor-change-sla.test.ts` | 7 SLA pure-helper tests. |
| `tests/unit/student-tutor-change-route.test.ts` | 4 POST route tests (auth, Zod, success, conflict). |
| `tests/unit/admin-tutor-change-route.test.ts` | 7 admin route tests (auth, status filter, propose-alternatives). |

Total: **36 new unit tests**.

---

## 3. Quality gates (CLAUDE §7)

| Gate | Result |
|---|---|
| `pnpm type-check` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0 (one pre-existing `lib/utils/logger.ts` warning unrelated to this slice) |
| `pnpm test --run` | ✅ exit 0 — 43 files, 355 tests, all passing |
| `pnpm build` | ✅ exit 0 — 23 new routes registered (`tutor-change-requests` × student + admin + 2 admin sub-routes + cron + dashboard pages) |

---

## 4. Files added / modified

### Added (24 files)

- `supabase/migrations/20260828000001_tutor_change_requests.sql`
- `apps/web/lib/validations/tutor-change.ts`
- `apps/web/services/student/tutor-change.ts`
- `apps/web/services/admin/tutor-change.ts`
- `apps/web/app/api/student/tutor-change-requests/route.ts`
- `apps/web/app/api/student/tutor-change-requests/[id]/route.ts`
- `apps/web/app/api/admin/tutor-change-requests/route.ts`
- `apps/web/app/api/admin/tutor-change-requests/[id]/alternatives/route.ts`
- `apps/web/app/api/admin/tutor-change-requests/[id]/resolution/route.ts`
- `apps/web/app/api/cron/check-tutor-change-sla/route.ts`
- `apps/web/app/[locale]/dashboard/tutor-change/page.tsx`
- `apps/web/app/[locale]/dashboard/tutor-change/new/page.tsx`
- `apps/web/app/[locale]/dashboard/tutor-change/[id]/page.tsx`
- `apps/web/app/[locale]/admin/tutor-change-requests/page.tsx`
- `apps/web/app/[locale]/admin/tutor-change-requests/[id]/page.tsx`
- `apps/web/components/dashboard/tutor-change-new-form.tsx`
- `apps/web/components/dashboard/tutor-change-select-form.tsx`
- `apps/web/components/admin/tutor-change-propose-form.tsx`
- `apps/web/components/admin/tutor-change-resolve-form.tsx`
- `apps/web/tests/unit/tutor-change-validation.test.ts`
- `apps/web/tests/unit/tutor-change-sla.test.ts`
- `apps/web/tests/unit/student-tutor-change-route.test.ts`
- `apps/web/tests/unit/admin-tutor-change-route.test.ts`
- `docs/review/PHASE2_SPRINT_6_SUMMARY.md` (this file)

### Modified (4 files)

- `apps/web/components/admin/admin-sidebar.tsx` — added `Repeat`
  icon import + `ICONS` map entry.
- `apps/web/components/admin/admin-top-nav.tsx` — same.
- `apps/web/messages/en.json` — `TutorChange.*` + sidebar / top-nav
  labels.
- `apps/web/messages/fr.json` — same.

---

## 5. Business rules deliberately NOT invented

These items remained BLOCKED in this slice per the original
authorisation. They are **not** silently invented:

- **E-1 / E-2 / E-3** (refund policy on tutor change).
- **P1.2 / P1.4 / P1.6** (unrelated profiles / sessions work).
- **P3.3** (subscription pack interactions with tutor change).
- **D-7** (whether the breach notification should be mirrored to the
  admin audience or only to the student — **current behaviour**:
  student only).
- **Auto-proposal of alternatives** when SLA breaches: deliberately
  NOT implemented; the cron only flags breaches, and the admin still
  drives the resolution.
- **Resend email mirror of the breach notification**: deliberately
  NOT implemented; the client has not confirmed email wording for
  this scenario. The n8n workflow that would render the email is
  out-of-scope for this slice.

If the client later wants a "tutor-change-breach" email template,
that should ship as a separate n8n workflow + an entry in
`n8n/docs/WORKFLOWS.md`.

---

## 6. Known limitations / follow-ups

1. The breach notification is in-app only. If the client wants email
   too, an n8n workflow consuming `notifications.type =
   'tutor_change_sla_breach'` and rendering via Resend is the
   architecture-aligned next step.
2. The cron endpoint exists but is not yet wired into a scheduler.
   Vercel Cron or any HTTP-capable cron can call it; the secret is
   shared with `N8N_WEBHOOK_SECRET`.
3. The student "new" form is gated to bookings with an assigned
   tutor in an open status. The gate is server-side enforced (RLS +
   service-layer check); the UI's booking-picker simply shows the
   student's open bookings.
4. There is intentionally NO tutor-facing dashboard. Tutors are
   notified of a change by the same `session_bookings.tutor_id`
   re-point + the existing Calendly/n8n/Zoom chain; the change is
   visible to them via the existing session-detail surface.
5. `describeError(...)` returns `Record<string, unknown>`; the two
   regex tests (`/uq_.../u.test(msg)`) coerce to string locally to
   satisfy strict typing without losing the original logging detail.

---

## 7. Explicit user approval required before

- Tagging `v1.7.0-phase2-sprint-6` and pushing.
- Starting Sprint 7 / any next slice.
- Any change to E-1, E-2, E-3, P1.2, P1.4, P1.6, P3.3, or D-7.

Per CLAUDE §5, **no work begins on the next sprint** without
explicit user approval.
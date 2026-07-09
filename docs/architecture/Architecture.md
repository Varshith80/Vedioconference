# Architecture

> Single source of truth for the platform's technical decisions.
> If a later change contradicts something in this file, this file
> wins — update it as part of the same change.

> **Sprint B2 — Module-based workflow.** The booking model is no
> longer "one Zoom meeting per course". The platform now has a
> two-tier model: students pay once for a **course** (creating an
> **enrollment**), and then book each **module** of that course
> individually through Calendly. Every module has its own Zoom
> meeting, its own confirmation/reminder emails, its own n8n
> workflow run, and its own progress tracking. The course is
> `completed` only when every one of its modules is `completed`.

## 1. Goals

1. **Low-code / no-code first.** Use managed SaaS for everything that
   is not business logic (payments, scheduling, video, email).
2. **Single Next.js codebase** for marketing site, student space and
   admin space — no extra CMS or admin tool to maintain.
3. **Supabase as the system of record.** All persistent data and
   authentication live in one managed Postgres instance.
4. **n8n is the only "backend for backend".** Calendly, Stripe, Zoom and
   Resend talk to n8n, which talks to Supabase. The Next.js app never
   calls Stripe or Zoom directly for the critical path.
5. **Hard security boundary** through JWT + RLS for every row.
6. **Module-first pedagogy.** A course is a **paid, persistent
   enrollment**; a module is one **live session inside that
   enrollment**. This lets a student pace their learning across
   weeks or months, swap tutors, and re-take a single module if
   needed, without re-paying for the course.

## 2. System diagram

See [`SYSTEM_ARCHITECTURE.mmd`](./SYSTEM_ARCHITECTURE.mmd).

```
Student → Next.js 15 → Supabase → n8n → {Calendly, Stripe, Zoom, Resend}
                                                  ↓
                                          Supabase (write-back)
                                                  ↓
                                          Dashboard update
```

The diagram is **per-module** in the bottom-right cluster: each
module booking fires its own Calendly → n8n → Zoom pipeline. The
top-right cluster is the **course-level** Stripe payment that
creates the `enrollments` row.

## 3. Layered architecture (Next.js)

| Layer        | Path                                 | Responsibility |
|--------------|--------------------------------------|----------------|
| Presentation | `apps/web/app/(marketing|auth|...)`  | Pages, layouts, RSC |
| UI           | `apps/web/components/`               | Re-usable presentational + form components |
| Hooks        | `apps/web/hooks/`                    | Client-only React state |
| Services     | `apps/web/services/`                 | Server-only data access (uses Supabase + n8n) |
| Lib / utils  | `apps/web/lib/`                      | Framework adapters, helpers, error classes |
| API          | `apps/web/app/api/**/route.ts`       | HTTP edge (REST) for external callers |
| Schema       | `supabase/migrations/`               | Source of truth for persistence |

Boundaries:

- Components never import from `services/` or `lib/supabase/admin.ts`.
- Services may use `lib/supabase/server.ts` (RLS-bound) but not
  `lib/supabase/admin.ts` (only the webhook handler does).
- API routes are the only callers of `lib/stripe/client.ts` and
  `lib/email/client.ts`.

## 4. Authentication

See [`AUTH_FLOW.mmd`](./AUTH_FLOW.mmd).

- **Provider:** Supabase Auth (email + password, password recovery).
- **Session:** JWT stored in an `httpOnly`, `Secure`, `SameSite=Lax`
  cookie. The cookie is set by `@supabase/ssr` and refreshed on every
  request by `apps/web/middleware.ts`.
- **Roles:** `student` (default), `admin`, `super_admin`. Stored in
  `public.profiles.role` and exposed through the helper functions
  `public.is_admin()` / `public.is_super_admin()` so that RLS policies
  can call them.
- **Protection:**
  - `middleware.ts` blocks unauthenticated traffic to `/dashboard/**`
    and `/admin/**`.
  - `app/admin/layout.tsx` adds a role check on top of that.
  - RLS policies are the final guard at the database level.

## 5. Course / module / booking flow (end-to-end)

See [`USER_FLOW.mmd`](./USER_FLOW.mmd) and
[`ER_DIAGRAM.mmd`](./ER_DIAGRAM.mmd).

The unit of payment is the **course** (one Stripe charge per course
per student). The unit of a live class is the **module booking**
(one Zoom meeting per booking). The course is the **enrollment**;
the module is the **pedagogical atom**.

### 5.1 Course enrollment (pay once per course)

1. Student browses the catalog (any `courses` row where
   `is_published = true`).
2. Student clicks **"S'inscrire"** on a course page.
3. `POST /api/enrollments` creates an `enrollments` row in
   `pending_payment` and a **Stripe Checkout Session** whose
   `metadata.enrollment_id` carries the new row's id.
4. On payment success, **Stripe webhook → n8n**
   (`enrollment-created`) flips the row to `active`, captures
   `stripe_payment_intent_id`, and (if not already there) inserts
   the student's `module_progress` rows for every `modules` row in
   the course.
5. The student lands on the course dashboard and can start
   booking modules.

### 5.2 Module booking (per live session)

1. Student picks a module (one of the `modules` rows in the
   enrolled course) that is not yet `completed`.
2. The course dashboard opens a **Calendly inline embed** that
   points at the module's `calendly_event_uri` (each module has
   its own event type).
3. `POST /api/module-bookings` is called by the client to **create
   the booking row** (status `scheduled`) and to register the
   intent to book. The actual `scheduled_start` / `scheduled_end`
   values come from **Calendly**, not from the client. Calendly is
   the source of truth for time.
4. Student picks a slot in Calendly. Calendly fires
   `invitee.created`.
5. **Calendly webhook → n8n** (`module-booking-to-zoom`):
   - Updates the `module_bookings` row with
     `calendly_event_uri`, `calendly_invitee_uri`,
     `scheduled_start`, `scheduled_end`.
   - Creates a **Zoom meeting** (Server-to-Server OAuth), writes a
     `meeting_links` row keyed to the `module_bookings.id`.
   - Flips `module_bookings.status` to `confirmed`.
   - Triggers the module confirmation email (Resend).
6. n8n schedules `module-reminder-scheduler` (cron) for T-24h
   and T-1h reminders.
7. The student attends the Zoom session.
8. On the **Zoom `meeting.ended` webhook** (or an admin
   confirmation), n8n fires `module-completed`:
   - `module_bookings.status = 'completed'`.
   - The matching `module_progress` row flips to `completed`
     with `completed_at = now()`.
   - If every module in the course is now `completed`, the
     `enrollments` row flips to `completed` with
     `completed_at = now()`.
9. The next module becomes bookable.

### 5.3 Reschedule, cancel, refund

- **Reschedule** — the student changes the slot in Calendly.
  Calendly fires `invitee.updated`; n8n voids the old Zoom
  meeting, creates a new one, updates the `module_bookings` row.
- **Cancel** — the student cancels in Calendly (or via
  `POST /api/module-bookings/[id]/cancel`). n8n voids the Zoom
  meeting, flips the row to `cancelled`, and emails the student.
  **No refund** is issued at the module level — refunds are
  course-level (see §5.4).
- **No-show** — the tutor (or admin) marks the session as
  `no_show` after the meeting window has passed.

### 5.4 Refunds (course-level only)

- Refunds are handled at the **course** level, not the module
  level. A student who completed only 2 of 5 modules and asks
  for a refund is refunded against the enrollment, not against
  any `module_bookings` row.
- The Stripe `refunds.create` call references
  `enrollment.stripe_payment_intent_id`. Module bookings are
  *not* individually refunded.
- A student who is refunded is moved to `enrollments.status =
  'refunded'`; their `module_bookings` rows stay as historical
  records and are *not* deleted.
- A refunded student can **re-enroll** in the same course; this
  creates a **new** `enrollments` row (a re-enrollment) and the
  old row stays in `refunded`.

### 5.5 Re-enrollment

- A student may enroll in a course more than once, including
  after `completed` or `refunded`.
- The `UNIQUE (student_id, course_id)` constraint on
  `enrollments` therefore applies only to the **active**
  enrollment: a partial unique index is used (see `Database.md`).
- A re-enrollment gets a fresh `module_progress` for every
  module; the previous `module_progress` rows stay in the
  database as historical records.

## 6. Data flow rules

- The Next.js app **never writes** to the `enrollments` status
  fields, the `module_bookings` status fields, or the
  `meeting_links` table for confirmed events. Those writes are
  owned by n8n, which is the only system with a service-role key
  in those flows.
- All payment / refund state changes are driven by Stripe
  webhooks; client code can only request them, not perform them.
- Calendly is the **source of truth for scheduled time**. The
  Next.js app never sets `module_bookings.scheduled_start` or
  `scheduled_end` from a client-supplied value; the client only
  picks a module, and the Calendly webhook fills the time.
- A single webhook entry point (`POST /api/webhooks/n8n`)
  accepts callbacks from n8n and updates Supabase using the
  admin client, with a shared secret in `X-Webhook-Secret`.

## 7. Failure / degradation modes

| Failure | Behaviour |
|---|---|
| Stripe webhook delayed | Enrollment stays `pending_payment`; user can retry the checkout link |
| Zoom create fails (per module) | n8n retries 3×; on permanent failure → `n8n_dead_letters` row + admin email, `module_bookings` stays `scheduled` |
| Email (Resend) fails | n8n retries; failure is logged in `n8n_executions` table |
| Supabase downtime | Next.js serves 5xx; Vercel surfaces the outage via its dashboard |
| Calendly webhook missed | Admin can trigger a manual sync from the admin dashboard (Phase 4) |
| Zoom `meeting.ended` missed | Tutor (or admin) can mark the session `completed` from the tutor dashboard (Phase 4) |

## 8. Branching & deployment

- Default branch: `main`. Everything merges via PR.
- Feature branches: `feat/<short-name>`
- Bug branches: `fix/<short-name>`
- Hotfix branches: `hotfix/<short-name>` → fast-track into `main`
- Vercel deploys every push to `main` to production.
- Preview deployments are created for every PR.

See [`docs/DevelopmentRoadmap.md`](../DevelopmentRoadmap.md) for the
release cadence and phase plan.

## 9. Module-based workflow (Sprint B2 — added)

The Sprint B2 change set introduces a strict two-tier data model
on top of the existing `courses` table. This section is a quick
reference; the full schema lives in
[`../database/Database.md`](../database/Database.md) and the full
flows in [`WORKFLOWS.md`](../../n8n/docs/WORKFLOWS.md).

### 9.1 Conceptual model

```
                    ┌──────────────────────────────────────────┐
                    │  Course (paid once per student)          │
                    │  ┌──────────────────────────────────┐    │
                    │  │ Enrollment (one per student)     │    │
                    │  │  ┌──────────┐ ┌──────────┐ ...   │    │
                    │  │  │ Module   │ │ Module   │       │    │
                    │  │  │  ┌────┐  │ │  ┌────┐  │       │    │
                    │  │  │  │ MB │  │ │  │ MB │  │       │    │
                    │  │  │  └────┘  │ │  └────┘  │       │    │
                    │  │  │ booking  │ │ booking  │       │    │
                    │  │  └──────────┘ └──────────┘       │    │
                    │  └──────────────────────────────────┘    │
                    └──────────────────────────────────────────┘
```

- `Course` is a `courses` row.
- `Enrollment` is an `enrollments` row (student × course, paid).
- `Module` is a `modules` row (pre-created by the admin as part
  of the course).
- `MB` is a `module_bookings` row (one Zoom session per row).
- `module_progress` tracks the lifecycle of a single module
  inside a single enrollment.

### 9.2 What is new in Sprint B2

- New tables: `modules`, `enrollments`, `module_progress`,
  `module_bookings`.
- New enums: `enrollment_status`, `module_progress_status`.
- The legacy `bookings` table is renamed to
  `_bookings_legacy`; new code does not read it.
- New API endpoints: `/api/enrollments`,
  `/api/enrollments/[id]/modules`, `/api/module-bookings`,
  `/api/module-bookings/[id]/cancel`.
- New n8n workflows: `enrollment-created`,
  `module-booking-to-zoom`, `module-completed`, plus the
  reminder / reschedule / cancel pair.
- RLS policies for the new tables.
- Domain types: `Module`, `Enrollment`, `ModuleProgress`,
  `ModuleBooking` in `apps/web/types/domain.ts`.

### 9.3 What is **not** in Sprint B2

- The **module dashboard UI** (the page that lists the modules
  inside a course, the per-module Calendly embed, the
  progress bar). That ships in a later sprint.
- The **course-level resource access UI** (downloading a
  resource from a course you are enrolled in). The
  `resource_grants` join is now keyed to `enrollments.id`
  instead of `bookings.id`; the UI is deferred.
- The **tutor module dashboard** (the tutor's view of "which
  students are about to take which module of my course"). That
  is in a later sprint.

---

*Last updated: 2026-07-09. Owner: project lead.*

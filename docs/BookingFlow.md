# Booking Flow (End-to-End)

> A line-by-line walkthrough of every step of a **course enrollment
> + module booking**, with the input, output, API, database write,
> external service, failure scenario, retry, and rollback for each
> step.
>
> **Sprint B2 change.** The flow is now **two-tier**:
>
> 1. **Course enrollment** — the student pays for the **whole
>    course** (one Stripe charge per course per student). This
>    creates an `enrollments` row and unlocks the modules.
> 2. **Module booking** — for every module the student wants to
>    take, a separate Calendly slot pick creates a
>    `module_bookings` row, a Zoom meeting, a confirmation email,
>    and a progress row. There is **no per-module payment** —
>    payment is course-level.
>
> The course is `completed` only when every one of its modules is
> `completed`.

## Overview

```
Student → Course detail → Stripe Checkout
                                 │
                                 ▼
                          Enrollment created
                                 │
                                 ▼
                       Course dashboard (modules)
                                 │
                                 ▼
            Student picks a module → Calendly embed
                                 │
                                 ▼
                       Module booking created
                                 │
                                 ▼
                  n8n → Zoom meeting created
                                 │
                                 ▼
                  Resend confirmation email
                                 │
                                 ▼
                  T-24h, T-1h reminders
                                 │
                                 ▼
                  Student attends Zoom
                                 │
                                 ▼
                  Zoom meeting.ended → module completed
                                 │
                                 ▼
                  All modules done? → Enrollment completed
```

The flow is **idempotent at every hop**: a replayed event never
creates a duplicate meeting, never charges a card twice, never
sends a duplicate email, and never marks a module `completed`
twice.

---

## Part A — Course enrollment (pay once per course)

### Step A1 — Student picks a course

| Field | Value |
|---|---|
| Input | Click on `/courses/[slug]` |
| Output | Course page rendered (RSC) |
| API | `GET /api/courses/[slug]` |
| Database | `SELECT * FROM courses WHERE slug=$1` |
| External service | none |
| Failure | 404 / 500 |
| Retry | client exponential backoff |
| Rollback | none |

### Step A2 — Student clicks "S'inscrire" (Enroll)

| Field | Value |
|---|---|
| Input | `POST /api/enrollments` with `{ courseId }` |
| Output | `enrollments` row in `pending_payment`, Stripe Checkout URL |
| API | `POST /api/enrollments` |
| Database | `INSERT INTO enrollments (student_id, course_id, status='pending_payment', amount_cents, currency)` |
| External service | none (Stripe Checkout Session is created next) |
| Failure | not logged in → 401; course not found / not published → 400 |
| Retry | client-driven |
| Rollback | none (the row is the anchor for the Stripe session) |

**Idempotency:** a partial unique index on
`(student_id, course_id) WHERE status IN ('pending_payment', 'active')`
prevents two active enrollments for the same pair.

### Step A3 — Stripe Checkout Session is created

| Field | Value |
|---|---|
| Input | The `enrollments` row from A2 |
| Output | Stripe Checkout URL with `metadata.enrollment_id` set |
| API | Stripe `POST /v1/checkout/sessions` (called from the route handler) |
| Database | `UPDATE enrollments SET stripe_session_id=…` |
| External service | Stripe |
| Failure | Stripe 5xx → user sees a generic error; enrollment stays `pending_payment` |
| Retry | client can re-submit (the `enrollments` row already exists, the session is recreated) |
| Rollback | none yet |

### Step A4 — Student pays (Stripe-hosted)

| Field | Value |
|---|---|
| Input | Browser redirected to Stripe Checkout |
| Output | Stripe-hosted payment page |
| API | none (browser-side) |
| Database | none |
| External service | Stripe |
| Failure | user closes the page → `cancel_url` redirects back to the course page; the enrollment stays `pending_payment` |
| Retry | user re-clicks "S'inscrire" |
| Rollback | none yet |

### Step A5 — Stripe sends `checkout.session.completed`

| Field | Value |
|---|---|
| Input | Stripe webhook payload, signed |
| Output | `enrollments.status='active'`, `module_progress` rows inserted for every module in the course |
| API | `POST /api/webhooks/stripe` → n8n `enrollment-created` workflow |
| Database | `INSERT INTO webhook_events (...)`, `UPDATE enrollments SET status='active', paid_at=…, stripe_payment_intent_id=…`, `INSERT INTO module_progress (...)` for every module |
| External service | Stripe |
| Failure | signature invalid → 401, no DB mutation; transient error → 5xx, Stripe retries |
| Retry | Stripe policy (up to 3 days) |
| Rollback | none |

**Idempotency:** `webhook_events.event_id` is `UNIQUE`. A replay
returns 200 with no work done.

### Step A6 — Enrollment confirmation email

| Field | Value |
|---|---|
| Input | internal (chain from A5) |
| Output | Resend accepts the email, a `notifications` row is written |
| API | Resend `POST /v1/emails` |
| Database | `INSERT INTO notifications (type='enrollment_active', channel='email')` |
| External service | Resend |
| Failure | Resend 4xx → log + admin email; Resend 5xx → n8n retries (3 attempts), final failure → dead-letter |
| Retry | n8n Retry-on-fail |
| Rollback | none |

The student is now on the course dashboard and can start
booking modules.

---

## Part B — Module booking (per live session)

### Step B1 — Student picks a module on the course dashboard

| Field | Value |
|---|---|
| Input | Click on a module tile |
| Output | Module detail with a Calendly inline embed |
| API | `GET /api/enrollments/[id]/modules` |
| Database | `SELECT m.*, mp.status AS progress_status, mp.completed_at FROM modules m LEFT JOIN module_progress mp ON mp.module_id = m.id AND mp.enrollment_id = $1 WHERE m.course_id = $2 ORDER BY m.position` |
| External service | none |
| Failure | 401 / 403 / 404 |
| Retry | client exponential backoff |
| Rollback | none |

The embed is configured with the module's `calendly_event_uri`.
**Calendly is the source of truth for the time** — the client
does not pick or send a `start`/`end`.

### Step B2 — Student picks a slot in Calendly

| Field | Value |
|---|---|
| Input | Time slot click in the Calendly embed |
| Output | Calendly fires `invitee.created` webhook with the chosen `start_time` / `end_time` |
| API | n8n endpoint `POST /api/webhooks/calendly` (inbound webhook) |
| Database | none yet |
| External service | Calendly |
| Failure | Calendly 5xx → user sees "try another slot" |
| Retry | Calendly retries its own webhooks |
| Rollback | n/a |

### Step B3 — n8n creates a `scheduled` `module_bookings` row

| Field | Value |
|---|---|
| Input | Calendly `invitee.created` payload |
| Output | `module_bookings` row in `scheduled` |
| API | Supabase admin insert (via n8n) |
| Database | `INSERT INTO module_bookings (enrollment_id, module_id, tutor_id, student_id, status='scheduled', scheduled_start, scheduled_end, calendly_event_uri, calendly_invitee_uri, timezone)` |
| External service | none |
| Failure | Supabase 5xx → Calendly webhook retries |
| Retry | n8n Retry-on-fail node (3 attempts) |
| Rollback | none (the row is the anchor for everything else) |

**Idempotency:** `module_bookings.calendly_invitee_uri` is
`UNIQUE`. Replays return the existing row.

**Note:** if the corresponding `enrollments` row is not in
`active`, the insert is rejected. Calendly webhooks for
non-enrolled invitees are surfaced as an admin notification and
do not create a row.

### Step B4 — n8n creates the Zoom meeting

| Field | Value |
|---|---|
| Input | `module_bookings` row from B3 |
| Output | Zoom meeting created, `meeting_links` row inserted, `module_bookings.status='confirmed'` |
| API | Zoom `POST /users/{zoom_user_id}/meetings` (Server-to-Server OAuth) |
| Database | `INSERT INTO meeting_links (module_booking_id, provider='zoom', meeting_id, join_url, start_url, passcode, host_url)`, `UPDATE module_bookings SET status='confirmed'` |
| External service | Zoom |
| Failure | Zoom 5xx → n8n retries with backoff; final failure → `n8n_dead_letters` row + admin email; `module_bookings` stays `scheduled` (UI shows "meeting is being prepared") |
| Retry | n8n Retry-on-fail (3 attempts) |
| Rollback | if the DB insert fails after the Zoom meeting was created, a periodic reconciliation subflow (`delete-orphan-meetings`) cleans up |

**Idempotency:** `meeting_links.module_booking_id` is `UNIQUE`.
A replay returns the existing meeting.

### Step B5 — Confirmation email (Resend)

| Field | Value |
|---|---|
| Input | internal (chain from B4) |
| Output | Resend accepts the email, a `notifications` row is written |
| API | Resend `POST /v1/emails` |
| Database | `INSERT INTO notifications (type='module_booking_confirmed', channel='email', payload={ module_booking_id, ... })` |
| External service | Resend |
| Failure | Resend 4xx → log + admin email; Resend 5xx → n8n retries (3 attempts), final failure → dead-letter |
| Retry | n8n Retry-on-fail |
| Rollback | none |

### Step B6 — Reminder emails (T-24h, T-1h)

| Field | Value |
|---|---|
| Input | n8n Cron, every 15 min |
| Output | Resend email + `notifications` row |
| API | Resend |
| Database | `INSERT INTO notifications (type='reminder_24h' \| 'reminder_1h')` keyed on `module_booking_id` |
| External service | Resend |
| Failure | n8n retries; final failure → dead-letter |
| Retry | n8n Retry-on-fail |
| Rollback | none |

**Idempotency:** the SQL query in
[`n8n/docs/WORKFLOWS.md`](../n8n/docs/WORKFLOWS.md) §2.4 uses
`NOT EXISTS` against the `notifications` table for the same
`module_booking_id` + `type` pair, so a slow run cannot
double-send.

### Step B7 — Student attends the class

| Field | Value |
|---|---|
| Input | Student clicks "Join" |
| Output | Zoom client opens |
| API | none |
| Database | none |
| External service | Zoom |
| Failure | n/a |
| Retry | n/a |
| Rollback | n/a |

### Step B8 — Class completes (Zoom `meeting.ended`)

| Field | Value |
|---|---|
| Input | Zoom `meeting.ended` webhook (or tutor / admin mark) |
| Output | `module_bookings.status='completed'`, `module_progress.status='completed'`, `module_progress.completed_at=now()` |
| API | n8n `module-completed` workflow |
| Database | `UPDATE module_bookings SET status='completed'`, `UPDATE module_progress SET status='completed', completed_at=now()` |
| External service | Zoom (or admin) |
| Failure | Supabase 5xx → retry |
| Retry | n8n Retry-on-fail |
| Rollback | none |

### Step B9 — Course completion check

| Field | Value |
|---|---|
| Input | the `module_progress` update from B8 |
| Output | If every module in the course is `completed`, the `enrollments` row flips to `completed` with `completed_at=now()` |
| API | DB trigger `enrollments_completion_trigger` (no external call) |
| Database | `UPDATE enrollments SET status='completed', completed_at=now() WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM module_progress mp WHERE mp.enrollment_id = $1 AND mp.status <> 'completed')` |
| External service | none |
| Failure | n/a |
| Retry | n/a |
| Rollback | none |

### Step B10 — Resource grants

| Field | Value |
|---|---|
| Input | post-completion (per the course-level rule) |
| Output | `resource_grants` rows for the enrollment |
| API | Supabase insert (admin) |
| Database | `INSERT INTO resource_grants (resource_id, enrollment_id)` for every resource attached to the course with `visibility='enrolled'` |
| External service | none |
| Failure | log; admin can retry from the panel |
| Retry | n/a (manual) |
| Rollback | none |

---

## Part C — Reschedule, cancel, refund

### Step C1 — Module reschedule (Calendly `invitee.updated`)

- Student changes the slot in Calendly.
- Calendly fires `invitee.updated`; n8n voids the old Zoom
  meeting (`DELETE /meetings/{id}`), creates a new one, updates
  the `module_bookings` row with the new `scheduled_start` /
  `scheduled_end`.
- No new `module_bookings` row is created. The old meeting
  is replaced; the same `module_bookings.id` keeps the
  `meeting_links` join consistent.

### Step C2 — Module cancellation (Calendly `invitee.canceled` or `POST /api/module-bookings/[id]/cancel`)

- `module_bookings.status='cancelled'`, `cancelled_at=now()`,
  `cancelled_reason` set.
- Zoom meeting is voided.
- Confirmation email is sent.
- **No refund.** The course is already paid for; the student
  can re-book the module later (creating a new `module_bookings`
  row for the same `enrollment_id` + `module_id` pair).
- Admin notification fires.

### Step C3 — Course-level refund (admin only)

- A student asks for a refund at the course level.
- Admin triggers `POST /api/admin/enrollments/[id]/refund` (added
  in B2). The route handler calls Stripe
  `refunds.create` against
  `enrollments.stripe_payment_intent_id`.
- Stripe fires `charge.refunded` → n8n flips
  `enrollments.status='refunded'`, `refunded_at=now()`,
  `refunded_amount_cents=…`.
- The student's existing `module_bookings` rows stay as
  historical records.
- The student may **re-enroll** in the same course: this creates
  a new `enrollments` row (a re-enrollment), the old `refunded`
  row stays in the database.

### Step C4 — Tutor / admin marks a `no_show`

- After the meeting window has passed, the tutor (or admin)
  flips the `module_bookings` row to `no_show`.
- The matching `module_progress` row stays
  `not_started` (or `in_progress` if it was started).
- The student can re-book the same module (creating a new
  `module_bookings` row for the same `enrollment_id` +
  `module_id` pair).
- No refund is issued at the module level.

---

## Race conditions considered

- **Two active enrollments for the same `(student_id, course_id)`** —
  prevented by the partial unique index on `enrollments`.
- **Double-booking a tutor for a module:** prevented by the
  trigger `module_bookings_no_overlap_per_tutor` (a tutor
  cannot have two `confirmed` or `scheduled` module bookings
  whose time ranges overlap for the same module's course).
- **Paying twice for the same course:** prevented by
  `enrollments.stripe_session_id` (if set) + the partial
  unique index on `(student_id, course_id) WHERE status IN
  ('pending_payment', 'active')`.
- **Webhook replay:** prevented by `webhook_events.event_id`
  `UNIQUE`.
- **Reminder duplicate:** prevented by `notifications` UNIQUE
  on `(user_id, type, module_booking_id, channel)`.
- **Completing a module twice:** prevented by `module_progress`
  UNIQUE on `(enrollment_id, module_id)`.
- **Booking a module that is already `completed`:** RLS + the
  application-level check in `POST /api/module-bookings` reject
  it.
- **Booking a module inside a course the student is not
  enrolled in:** the `module_bookings.enrollment_id` FK
  ensures the enrollment exists; the application check ensures
  `enrollments.status='active'` and `enrollments.student_id =
  auth.uid()`.
- **Booking a module whose `position` skips an unfinished
  predecessor (Sprint C precondition 2):** the
  `fn_module_unlock_check` BEFORE INSERT trigger on
  `module_bookings` raises `P0001 / module_locked` with a
  count of blocking predecessors. The
  `services/bookings/module-unlock.ts` helper runs the same
  check on the application side and returns a friendlier
  `409 module_locked` response with the structured
  `blockingModuleIds` list before the round-trip.

---

## Sprint C update (2026-07-10)

The booking flow is now wired end-to-end. The locked
architecture (CLAUDE.md §2.3) — *n8n is the only system that
calls Stripe or Zoom on the booking path* — is enforced at
the Next.js boundary. The Next.js app exposes:

- A `POST /api/enrollments/checkout` route that delegates
  the Stripe Checkout Session creation to the n8n
  `enrollment-created` workflow (mock-gated: when
  `N8N_ENROLLMENT_WEBHOOK_URL` is unset, the route returns
  `503 checkout_unavailable` — no destructive call).
- A `POST /api/webhooks/stripe` handler that, on
  `checkout.session.completed`, updates `payments`, flips
  the `enrollments` row to `active` + `paid_at` +
  `stripe_session_id`, and creates one `module_progress`
  row per published module.
- A `POST /api/webhooks/calendly` handler that, on
  `invitee.created`, forwards the event to the n8n
  `module-booking-to-zoom` workflow (which creates the Zoom
  meeting, persists the `meeting_link` row, and triggers
  the `module-confirmation-email` sub-workflow that
  Resend-sends the join URL).
- 6 server-rendered React Email templates, locale-aware via
  the B1-i18n factory pattern.

Two new DB triggers back the policy:

- `fn_enrollments_refund` (Sprint C precondition 1) — when
  a `payments` row flips to `status='refunded'`, cascades
  the flip to the linked `enrollments` row.
- `fn_module_unlock_check` (Sprint C precondition 2) —
  rejects `module_bookings` inserts that would skip an
  unfinished predecessor module.

The 9 n8n workflows (the 8 Phase 1 placeholders are deleted)
are real workflow JSON ready to import via
`n8n import:workflow --input=<file>`. Their contracts are
documented in `n8n/docs/WORKFLOWS.md` §2.

---

*Last updated: 2026-07-10. Owner: project lead. Sprint C change.*

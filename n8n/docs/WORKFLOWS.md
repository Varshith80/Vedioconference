# n8n Workflow Plan

> ⚠️ **Phase 1 + Sprint B2 + Sprint 3.5 deliverable** —
> these workflows are **designed and documented but NOT yet
> fully implemented**. The Phase 1 inventory has been
> **replaced by the Sprint B2 module-based inventory**
> below, which has itself been **extended in Sprint 3.5**
> to use the v2 session-based hierarchy (per the
> user-approved Sprint 3.5 plan, with field renames only
> — no filename changes). Implementation begins in Phase 3
> once the Supabase schema is fully live and the Stripe /
> Calendly / Zoom credentials are provisioned.

This document describes every workflow that lives in n8n. n8n
is the **automation layer** that wires together the third-party
SaaS tools (Calendly, Stripe, Zoom, Resend) and pushes the
resulting state back to Supabase.

> **Sprint B2 change.** The booking workflow is now
> **module-based**. The unit of payment is the **course** (one
> Stripe charge per course per student, via the
> `enrollment-created` workflow). The unit of a live class is
> the **module booking** (one Zoom meeting per module booking,
> via `module-booking-to-zoom`). The course is `completed` only
> when every one of its modules is `completed` (via
> `module-completed`).
>
> **Sprint 3.5 change.** The booking workflow is now
> **session-based**. The unit of payment is the **session**
> (one Stripe charge per session per student, via the same
> `enrollment-created` workflow — *filename unchanged*). The
> unit of a live class is the **session booking** (one Zoom
> meeting per session booking, via the same
> `module-booking-to-zoom` workflow — *filename unchanged*).
> Only the **internal payload field names** were renamed:
>
> | Old field name | New field name |
> |----------------|----------------|
> | `enrollment_id` | `session_grant_id` |
> | `module_id` | `session_id` |
> | `module_booking_id` | `session_booking_id` |
>
> The `enrollment_status` Postgres enum is reused for
> `session_grants.status` (the user-approved Q6 answer).
> The next sections of this document reflect both the v1
> (B2/C) and v2 (3.5) field names.

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│   Student   │────▶│  Next.js 15  │────▶│  Supabase  │
│   / Tutor   │     │   (Vercel)   │     │ Postgres   │
└─────────────┘     └──────┬───────┘     └─────┬──────┘
                            │ webhook             │ service-role
                            ▼                     ▼
                    ┌──────────────────────────────────┐
                    │                n8n               │
                    │  (self-hosted or n8n.cloud)      │
                    └─┬────────┬─────────┬──────────┬──┘
                      ▼        ▼         ▼          ▼
                  Calendly  Stripe    Zoom       Resend
```

---

## 1. Workflow inventory (Sprint B2)

| # | Workflow                          | Trigger                              | Outputs (writes to)               |
|---|-----------------------------------|--------------------------------------|-----------------------------------|
| 1 | enrollment-created                | Stripe `checkout.session.completed`  | supabase `enrollments` (active), `module_progress` (not_started) |
| 2 | module-booking-to-zoom            | Calendly `invitee.created`           | supabase `module_bookings`, `meeting_links` |
| 3 | module-completed                  | Zoom `meeting.ended`                 | supabase `module_bookings` (completed), `module_progress` (completed), `enrollments` (completed if all modules done) |
| 4 | module-confirmation-email         | n8n internal (chain from 2)          | resend, supabase `notifications`  |
| 5 | module-reminder-scheduler         | n8n Cron (every 15 min)              | resend, supabase `notifications`  |
| 6 | module-reschedule                 | Calendly `invitee.updated`           | supabase `module_bookings`, void old Zoom, create new |
| 7 | module-cancellation               | Calendly `invitee.canceled` / `POST /api/module-bookings/[id]/cancel` | supabase `module_bookings` (cancelled), void Zoom |
| 8 | admin-notification                | n8n internal (1, 2, 3, 5, 6, 7)      | resend to admin                   |
| 9 | tutor-notification                | n8n internal (2)                     | resend to tutor (host `start_url`) |

### 1.1 What replaced what (Sprint B2)

| Old (Phase 1) | New (Sprint B2) | Notes |
|---|---|---|
| 1. booking-to-payment   | *(removed)* | Calendly no longer drives the payment path |
| 2. payment-to-zoom      | 2. module-booking-to-zoom | Zoom is per-module, not per-course |
| 3. confirmation-email   | 4. module-confirmation-email | The email is per-module-booking, not per-course |
| 4. reminder-scheduler   | 5. module-reminder-scheduler | Reminders are per-module-booking |
| 5. reschedule           | 6. module-reschedule | Reschedules are per-module |
| 6. cancellation         | 7. module-cancellation | Cancellations are per-module, no per-module refund |
| 7. admin-notification   | 8. admin-notification | Same shape, more triggers |
| 8. tutor-notification   | 9. tutor-notification | Same shape |
| *(new)*                 | 1. enrollment-created | New: course-level Stripe → enrollment |
| *(new)*                 | 3. module-completed   | New: Zoom `meeting.ended` → module progress |

---

## 2. Workflow details

### 2.1 enrollment-created  (`enrollment-created.json`)

**Trigger:** Stripe Webhook — `checkout.session.completed`

**Inputs (from Stripe):**
- `session.metadata.enrollment_id` : the new enrollment's id
- `session.payment_intent`         : the Stripe payment intent
- `session.amount_total`           : paid amount in cents
- `session.customer_email`         : student's email (sanity check)

**Steps:**
1. **Verify signature** with `STRIPE_WEBHOOK_SECRET`.
2. **Lookup enrollment** by `session.metadata.enrollment_id`.
3. **Update enrollment** (`status='active'`, store
   `stripe_payment_intent_id`, `amount_cents`, `paid_at=now()`).
4. **Create `module_progress` rows** for every published module
   in the course, in `not_started` state (no-op if they already
   exist).
5. **Trigger admin notification** (workflow 8).
6. **Trigger confirmation email** (the "you are enrolled" email;
   distinct from the per-module confirmation email of 2.4).
7. *(optional, Phase 3+)* **Trigger resource grant** for the
   course's `enrolled`-visibility resources.

**Failure modes:**
- Enrollment not found → admin notification + dead-letter row.
- Module insert fails → admin notification + dead-letter row;
  the enrollment is still `active` (the student is paid; an
  admin can backfill `module_progress`).

**Idempotency:** the `enrollment_id` lookup is by primary key.
A replayed Stripe event re-enters the same row; the module
insert is `ON CONFLICT (enrollment_id, module_id) DO NOTHING`.

---

### 2.2 module-booking-to-zoom  (`module-booking-to-zoom.json`)

**Trigger:** Calendly Webhook — `invitee.created`

**Inputs (from Calendly):**
- `payload.uri`              : `calendly_event_uri` (matches a module's `calendly_event_uri`)
- `payload.invitee.uri`      : `calendly_invitee_uri` (UNIQUE on `module_bookings`)
- `payload.invitee.name`, `payload.invitee.email`
- `payload.scheduled_event.start_time`, `payload.scheduled_event.end_time`
- `payload.tracking.utm_*`

**Steps:**
1. **Validate** payload (Zod equivalent / `if` node).
2. **Lookup module** in Supabase by `calendly_event_uri`.
3. **Lookup enrollment** in Supabase by `invitee.email` + module
   → course. The enrollment must be `active`.
4. **Create / update `module_bookings` row** in
   `status='scheduled'` with `scheduled_start`, `scheduled_end`
   from the payload. The UNIQUE constraint on
   `calendly_invitee_uri` ensures replays are no-ops.
5. **Create Zoom meeting** via Zoom Server-to-Server OAuth
   (`POST /users/{user_id}/meetings`) with
   `topic = course title · module title`,
   `start_time = module_bookings.scheduled_start`,
   `duration = module.duration_min`.
6. **Insert `meeting_links` row** in Supabase, keyed on
   `module_booking_id` (UNIQUE).
7. **Update `module_bookings`** to `status='confirmed'`.
8. **Trigger module-confirmation-email** (workflow 4) with
   the join URL.
9. **Trigger tutor-notification** (workflow 9) with the host
   `start_url`.

**Failure modes:**
- Module not found → admin notification + dead-letter row.
- Enrollment not `active` (or not found) → admin notification +
  dead-letter row. The Calendly invitee is emailed a polite
  "we could not process your booking" message.
- Zoom create fails → n8n retries with backoff (3 attempts);
  on permanent failure → `n8n_dead_letters` row + admin email;
  `module_bookings` stays `scheduled` (UI shows "meeting is
  being prepared").

---

### 2.3 module-completed  (`module-completed.json`)

**Trigger:** Zoom Webhook — `meeting.ended`

**Inputs (from Zoom):**
- `payload.object.id`         : the Zoom `meeting_id`
- `payload.object.start_time` : sanity check
- `payload.object.end_time`   : sanity check (used to compute
   the actual duration; the booking's `scheduled_start` /
   `scheduled_end` are the contract)

**Steps:**
1. **Lookup `meeting_links`** by `meeting_id` (UNIQUE).
2. **Lookup `module_bookings`** by `module_booking_id`.
3. **Update `module_bookings`** to `status='completed'`.
4. **Update `module_progress`** for the matching
   `(enrollment_id, module_id)` to `status='completed'`,
   `completed_at=now()`.
5. **Check enrollment completion**: if every other
   `module_progress` row for the same `enrollment_id` is
   `completed`, set `enrollments.status='completed'`,
   `completed_at=now()`. (The DB trigger
   `enrollments_completion_trigger` enforces this atomically;
   n8n's check is a defensive double-check.)
6. **Trigger admin notification** (workflow 8) — the admin
   dashboard can show "Module X of course Y completed by
   student Z" in its activity feed.

**Failure modes:**
- Meeting link not found → admin notification + dead-letter
  row.
- Zoom webhook missed → a tutor / admin can mark the session
  `completed` from the tutor dashboard (Phase 4), which
  directly calls the same SQL update as step 3–4.

**Idempotency:** the `module_bookings` update is from
`status IN ('scheduled', 'confirmed')` to `'completed'`; a
replay of the same `meeting.ended` is a no-op because
`status` is already `'completed'`.

---

### 2.4 module-confirmation-email  (`module-confirmation-email.json`)

**Trigger:** Internal — invoked by 2.2 (module-booking-to-zoom).

**Inputs:** `module_booking_id`.

**Steps:**
1. Fetch `module_bookings` + `modules` + `meeting_links` from
   Supabase.
2. Render React Email template `ModuleBookingConfirmed` with
   the module title, scheduled time (in the student's locale),
   and the Zoom join URL.
3. Send via Resend.
4. Insert a `notifications` row
   (`type='module_booking_confirmed'`, `channel='email'`,
   `payload={ module_booking_id, ... }`).

**Idempotency:** keyed on the `module_booking_id`; replays
are guarded by `notifications` UNIQUE on
`(user_id, type, module_booking_id, channel)`.

---

### 2.5 module-reminder-scheduler  (`module-reminder-scheduler.json`)

**Trigger:** n8n Cron — every 15 minutes.

**Steps:**
1. Query Supabase for `module_bookings` where:
   - `status = 'confirmed'`
   - `scheduled_start BETWEEN now()+24h AND now()+24h+15m`  (T-24h)
   - **OR** `scheduled_start BETWEEN now()+1h AND now()+1h+15m`  (T-1h)
   - **AND** no `notifications` row with
     `type='reminder_24h'` / `reminder_1h` exists for the
     `module_booking_id`.
2. For each module booking, send a Resend email with the join
   link.
3. Insert a `notifications` row to mark the reminder as sent.

**Idempotency:** the `NOT EXISTS` clause prevents
double-sending. A replay of the same query 15 min later
returns nothing.

---

### 2.6 module-reschedule  (`module-reschedule.json`)

**Trigger:** Calendly Webhook — `invitee.updated` with new
`start_time`.

**Steps:**
1. **Lookup old `module_bookings`** by `calendly_invitee_uri`.
2. **Void** the old Zoom meeting (`DELETE /meetings/{id}`).
3. **Create** a new Zoom meeting with the new
   `scheduled_start` / `scheduled_end`.
4. **Update `meeting_links`** for the same `module_booking_id`
   with the new `meeting_id` / `join_url` / `start_url`.
5. **Update `module_bookings`** with the new
   `scheduled_start` / `scheduled_end`. The row stays
   `status='confirmed'`. The `rescheduled_from` field is **not**
   used for module bookings — the same `module_bookings.id`
   tracks the latest scheduled time. (The DB column is kept for
   parity with the legacy `bookings` schema and for future
   auditing needs.)
6. **Send Resend email** with the new join link.
7. **Trigger admin notification** (workflow 8).

**Failure modes:**
- Old Zoom void fails (404, already gone) → log + continue.
- New Zoom create fails → n8n retries 3×; on permanent
  failure → dead-letter + admin email; the
  `module_bookings` row stays `confirmed` with the **old**
  time (the new time is the one the student picked; if Zoom
  creation fails, the student is asked to re-pick).

---

### 2.7 module-cancellation  (`module-cancellation.json`)

**Trigger:** Calendly Webhook — `invitee.canceled` **OR** direct
call from `POST /api/module-bookings/[id]/cancel`.

**Steps:**
1. **Lookup `module_bookings`** by id (or by
   `calendly_invitee_uri`).
2. **Update `module_bookings`** to `status='cancelled'`,
   `cancelled_at=now()`, `cancelled_reason` set.
3. **Delete Zoom meeting** (`DELETE /meetings/{id}`).
4. **No Stripe refund** at the module level. Refunds are
   course-level (§2.8 below).
5. **Send Resend email** confirming the cancellation.
6. **Trigger admin notification** (workflow 8).

**Idempotency:** the update is from
`status IN ('scheduled', 'confirmed')` to `'cancelled'`. A
replay is a no-op.

---

### 2.8 admin-notification  (`admin-notification.json`)

**Trigger:** Internal — called from 2.1, 2.2, 2.3, 2.5, 2.6, 2.7.

**Steps:**
1. Compose digest or per-event email.
2. Send via Resend to `ADMIN_EMAIL` (env var on n8n).

---

### 2.9 tutor-notification  (`tutor-notification.json`)

**Trigger:** Internal — called from 2.2 (module-booking-to-zoom).

**Steps:**
1. **Send Resend email** to tutor with student name, course
   title, module title, scheduled time, and host `start_url`
   (host-only Zoom link).

---

## 3. Course-level refunds (out of n8n)

Refunds are **course-level** and are triggered **manually** by
an admin from the admin dashboard, **not** by an n8n workflow.
The admin calls `POST /api/admin/enrollments/[id]/refund`; the
route handler calls Stripe `refunds.create` against
`enrollments.stripe_payment_intent_id`. Stripe fires
`charge.refunded` → `POST /api/webhooks/stripe` flips
`enrollments.status='refunded'`, `refunded_at=now()`,
`refunded_amount_cents=…`.

The n8n workflows do not handle refunds.

---

## 4. Shared credentials (n8n)

| Credential          | Type          | Scope                                        |
|---------------------|---------------|----------------------------------------------|
| `supabase_admin`    | Header Auth   | `apikey: $SUPABASE_SERVICE_ROLE_KEY`         |
| `stripe`            | Stripe API    | Restricted key with `checkout + refunds`     |
| `zoom_oauth`        | OAuth2        | Server-to-Server app, `meeting:write` scope  |
| `calendly_pat`      | Header Auth   | `Bearer $CALENDLY_PERSONAL_TOKEN`            |
| `resend`            | Header Auth   | `Authorization: Bearer $RESEND_API_KEY`      |

---

## 5. Failure handling

- Every node that mutates external state is wrapped in a **Retry
  on Fail** node (3 attempts, exponential backoff).
- After final failure, the row is annotated with
  `metadata.last_error` and a row is inserted into the
  dead-letter Supabase table (`n8n_dead_letters`).
- The admin notification workflow subscribes to that table via
  Realtime and surfaces failures in the admin dashboard.

---

## 6. Observability

- Each workflow writes a row to a Supabase `n8n_executions`
  table (created in a follow-up migration) with start/end
  timestamps, node counts, and a status (`ok` / `error`).
- The admin dashboard reads this table to display a 7-day
  execution timeline.

---

## 7. Versioning

Every workflow is exported as JSON and committed under
`n8n/workflows/`. The deploy script (`scripts/deploy-n8n.sh`)
uses `n8n import:workflow --input=<file>` to install or update
workflows in the target environment.

The Sprint B2 JSON files are still Phase 1 placeholders; they
will be replaced when the workflows are implemented in Phase 3.
The JSON filenames follow the new naming convention
(`enrollment-created.json`, `module-booking-to-zoom.json`, …).

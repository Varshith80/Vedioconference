# n8n Workflow Plan

> ⚠️ **Phase 1 + Sprint B2 + Sprint 3.5 + Sprint 10 deliverable** —
> the workflow JSONs in `n8n/workflows/` are now **authored against
> the v2 schema** (Sprint 10 I-1). The Sprint B2 module-based
> inventory below was extended in Sprint 3.5 to use the v2
> session-based hierarchy, and the I-1 sprint rewrote the eight
> v1-shaped JSONs to emit v2 event types and call the v2 Next.js
> routes. The deprecated `module-reminder-scheduler.json` is
> removed; `session-reminder-scheduler.json` (workflow 10) is the
> only v2 live workflow and was not touched by Sprint 10.
>
> **Sprint 10 I-1 changes (summary, see §2 for per-workflow detail):**
> - All eight v1-shaped JSONs (`enrollment-created`,
>   `module-booking-to-zoom`, `module-completed`,
>   `module-confirmation-email`, `module-reschedule`,
>   `module-cancellation`, `admin-notification`, `tutor-notification`)
>   rewritten to use the v2 field names (`session_grant_id`,
>   `session_booking_id`, `session_id`) and to emit the v2 event
>   types the Next.js handler now routes on
>   (`session_grant_checkout_created`, `session_booking_cancelled`,
>   `session_booking_rescheduled`, `session_completed`).
> - The v1 event types `module_completed`, `module_cancelled`,
>   `module_rescheduled`, `enrollment_checkout_created` are no
>   longer emitted by any workflow.
> - Two new Next.js routes back the v2 workflows:
>   `POST /api/n8n/notify` (the email renderer; n8n is the
>   orchestrator, Next.js owns the template + Resend call) and
>   `POST /api/enrollments/by-calendly-invitee` (the booking-
>   context resolver; the only safe way for n8n to learn the
>   `session_booking_id` for a Calendly invitee without holding
>   a Supabase service-role key).
> - The admin recipient is **hard-coded** server-side in
>   `lib/constants/ADMIN_NOTIFY_EMAIL`. The workflows therefore
>   no longer read a `$env.ADMIN_NOTIFY_EMAIL` (that env var was
>   the v1 leak path).
> - The deprecated `module-reminder-scheduler.json` is removed
>   (the v1 cron scanned `module_bookings`, which no longer
>   exists; the v2 live workflow is `session-reminder-scheduler.json`,
>   webhook-driven by `POST /api/cron/send-reminders`).

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

## 1. Workflow inventory (Sprint B2 + Sprint 10 I-1)

| # | Workflow                          | Trigger                              | Outputs (writes to)               |
|---|-----------------------------------|--------------------------------------|-----------------------------------|
| 1 | enrollment-created                | Next.js checkout route (Sprint 10 — n8n receives the v2 `session_grant_id`) | Stripe Checkout Session, `POST /api/webhooks/n8n` `session_grant_checkout_created` (→ `session_grants.stripe_session_id`), `POST /api/n8n/notify` `session_grant_checkout_created` email |
| 2 | module-booking-to-zoom            | Calendly `invitee.created`           | supabase `meeting_links` (`meeting_created` callback), `POST /api/n8n/notify` confirmation + tutor emails |
| 3 | module-completed                  | n8n Cron / external trigger (Sprint 10 — I-1 emits `session_completed`) | `POST /api/webhooks/n8n` `session_completed` (→ `session_bookings.status='completed'`), `POST /api/n8n/notify` `session_completed` email |
| 4 | module-confirmation-email         | n8n internal (chain from 2)          | `POST /api/n8n/notify` `session_booking_confirmed` template |
| 10 | session-reminder-scheduler       | Webhook from Next.js cron (`POST /api/cron/send-reminders`) [Sprint 5 Slice E — UNTOUCHED by Sprint 10] | resend, supabase `notifications` |
| 6 | module-reschedule                 | Calendly `invitee.updated`           | PATCH Zoom meeting, `POST /api/webhooks/n8n` `session_booking_rescheduled`, `POST /api/n8n/notify` `session_booking_rescheduled` |
| 7 | module-cancellation               | Calendly `invitee.canceled` / Next.js cancel route | DELETE Zoom meeting, `POST /api/webhooks/n8n` `session_booking_cancelled`, `POST /api/n8n/notify` `session_booking_cancelled` |
| 8 | admin-notification                | n8n internal (1, 2, 3, 6, 7)         | `POST /api/n8n/notify` `admin_*` template (recipient is hard-coded server-side — no `to` body field) |
| 9 | tutor-notification                | n8n internal (2)                     | `POST /api/n8n/notify` `email_tutor` (subject + body built in n8n) |

> **Sprint 10 — I-1:** workflow 5 (`module-reminder-scheduler.json`)
> is REMOVED. The v1 cron scanned `module_bookings`, which no
> longer exists; the v2 live workflow is workflow 10
> (`session-reminder-scheduler.json`), webhook-driven by
> `POST /api/cron/send-reminders` and out of scope for I-1.
> The `enrollments` / `module_bookings` / `module_progress` table
> references in the "Outputs" column are the v1 inventory rows
> preserved here for historical reference; the v2 schemas are
> `session_grants` / `session_bookings` / (none — the
> `module_progress` table is gone in v2).

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

### 2.1 enrollment-created  (`enrollment-created.json`) — Sprint 10 I-1

**Trigger:** Next.js checkout route — `POST` to this workflow's
webhook with the v2 payload:
- `session_grant_id` (UUID, the new `session_grants.id`)
- `student_id` (UUID)
- `session_id` (UUID, the new `session_id` of the v2
  session-based hierarchy)
- `amount_cents` (integer)
- `currency` (3-letter ISO, e.g. `EUR`)
- `product_name` (display string)
- `student_email`, `student_name`, `locale` (optional, for the
  confirmation email)

> The Sprint 10 I-1 trigger is **Next.js → n8n**, not
> Stripe → n8n directly. Next.js owns the v2 enrollment
> creation (the v2 route inserts the `session_grants` row in
> `pending_payment` state and then asks n8n to mint the
> Stripe Checkout Session). The Stripe `checkout.session.completed`
> callback lands on `POST /api/webhooks/stripe` and flips the
> grant to `paid` via the v2 `markSessionGrantPaid` service
> (out of scope for n8n).

**Steps (Sprint 10 I-1 v2):**
1. **Verify webhook secret** (`x-webhook-secret` =
   `$N8N_WEBHOOK_SECRET`).
2. **Create Stripe Checkout Session** at
   `POST https://api.stripe.com/v1/checkout/sessions` with
   `mode=payment`, `client_reference_id=session_grant_id`, and
   `metadata={ session_grant_id, student_id, session_id }`.
3. **Notify Next.js** of the created checkout via
   `POST ${NEXT_PUBLIC_SITE_URL}/api/webhooks/n8n` with body
   `{ type: 'session_grant_checkout_created', session_grant_id,
   stripe_session_id, checkout_url, amount_cents, currency }`.
   Next.js persists `session_grants.stripe_session_id`.
4. **Send confirmation email** via
   `POST ${NEXT_PUBLIC_SITE_URL}/api/n8n/notify` with
   `{ type: 'email', template: 'session_grant_checkout_created',
   to: <student_email>, props: { studentName, productName } }`.
5. **Respond OK** to the Next.js checkout route with
   `{ checkout_url, stripe_session_id }`.

**Failure modes:**
- Stripe Checkout creation fails → `workflow_failed` callback
  to `/api/webhooks/n8n` (writes `n8n_dead_letters`).
- Next.js notify or email step fails → same dead-letter path.

**Idempotency:** the `client_reference_id` is the
`session_grant_id`; Stripe re-uses the same session id on a
retry of the same payment. The Next.js `session_grant_checkout_created`
handler does an `update` on `session_grants` keyed by
`session_grant_id` (replay-safe).

---

### 2.2 module-booking-to-zoom  (`module-booking-to-zoom.json`) — Sprint 10 I-1

**Trigger:** Calendly Webhook — `invitee.created` (forwarded
to n8n by `POST /api/webhooks/calendly`).

**Inputs (from Calendly):**
- `payload.uri`     : `calendly_invitee_uri` (UNIQUE on
  `session_bookings`)
- `payload.event`   : `calendly_event_uri` (matched for
  defence-in-depth in the resolver; see step 2)

**Steps (Sprint 10 I-1 v2):**
1. **Verify webhook secret** + `event === 'invitee.created'`.
2. **Resolve booking context** via
   `POST ${NEXT_PUBLIC_SITE_URL}/api/enrollments/by-calendly-invitee`
   with body `{ calendly_invitee_uri, calendly_event_uri }`.
   Next.js returns the full `BookingContext`:
   `session_booking_id`, `session_id`, `session_grant_id`,
   `student_id`, `tutor_id`, `session_title`, `course_title`,
   `student_name`, `tutor_name`, `scheduled_start`,
   `scheduled_end`, `timezone`, `duration_min`, `join_url`.
   The route is `x-webhook-secret`-authenticated and uses the
   service-role admin client (n8n is a trusted system, not a
   student). The response does NOT include the student's email
   — n8n resolves that elsewhere (e.g. from the
   `session_grant_checkout_created` payload, or from a future
   resolver extension).
3. **Mint Zoom S2S access token** via
   `GET https://zoom.us/oauth/token?grant_type=account_credentials`.
4. **Create Zoom meeting** at
   `POST https://api.zoom.us/v2/users/{ZOOM_DEFAULT_HOST_USER_ID}/meetings`
   with `topic`, `start_time`, `duration`, `timezone` from
   the resolver response, and `settings.join_before_host=false,
   waiting_room=true, mute_upon_entry=true, audio=voip`.
5. **Persist `meeting_link`** via
   `POST ${NEXT_PUBLIC_SITE_URL}/api/webhooks/n8n` with body
   `{ type: 'meeting_created', session_booking_id, meeting_id,
   join_url, start_url, passcode }`. Next.js upserts the
   `meeting_links` row (UNIQUE on `session_booking_id`) and
   flips `session_bookings.status='confirmed'`.
6. **Send student confirmation email** via
   `POST ${NEXT_PUBLIC_SITE_URL}/api/n8n/notify` with
   `{ type: 'email', template: 'session_booking_confirmed',
   to: <student_email>, props: { studentName, sessionTitle,
   scheduledStartIso, joinUrl, dashboardUrl } }`.
7. **Send tutor notification** via
   `POST ${NEXT_PUBLIC_SITE_URL}/api/n8n/notify` with
   `{ type: 'email_tutor', to: <tutor_email>, subject, body,
   session_booking_id }`.
8. **Respond OK** to the Calendly forwarder.

**Failure modes:**
- Resolver 404 (no `session_bookings` row for the invitee) →
  the workflow short-circuits and responds OK; the Calendly
  invitee was not yet bound to a v2 booking. The next Calendly
  webhook will retry; the user-facing booking-create flow
  (`POST /api/session-bookings`) must run first.
- Resolver 409 (event URI mismatch) → admin notification +
  dead-letter row.
- Zoom create fails → dead-letter path; the
  `session_bookings` row stays in its pre-confirmation state.
- `meeting_created` callback fails → `meeting_links` is
  not backfilled; the workflow retries 3×; permanent failure
  → dead-letter.

**Idempotency:** the `meeting_links.session_booking_id`
UNIQUE index dedupes the Zoom create step on replay. The
`webhook_events.event_id` UNIQUE index dedupes the
`meeting_created` callback.

---

### 2.3 module-completed  (`module-completed.json`) — Sprint 10 I-1

**Trigger:** n8n Cron / external trigger. The v1 trigger
(Zoom `meeting.ended` webhook) is REMOVED in v2; Zoom
recording.completed write-back is a separate Sprint 11 R-3
item, not I-1.

**Inputs:**
- `session_booking_id` (UUID)
- `session_id` (UUID)
- `session_grant_id` (UUID)
- `student_email`, `student_name`, `session_title`, `locale`
  (for the email)
- `completed_at` (optional ISO timestamp; defaults to `now()`)

**Steps (Sprint 10 I-1 v2):**
1. **Verify webhook secret.**
2. **Notify Next.js** via
   `POST ${NEXT_PUBLIC_SITE_URL}/api/webhooks/n8n` with body
   `{ type: 'session_completed', session_booking_id,
   session_id, session_grant_id, completed_at }`. Next.js
   flips `session_bookings.status='completed'` (guarded by
   `status IN ('scheduled', 'confirmed')`, so a replay is a
   no-op).
3. **Send session-completed email** via
   `POST ${NEXT_PUBLIC_SITE_URL}/api/n8n/notify` with
   `{ type: 'email', template: 'session_completed',
   to: <student_email>, props: { studentName, sessionTitle,
   dashboardUrl } }`.

**Failure modes:**
- Notify or email step fails → dead-letter path; the booking
  is still `completed` in the DB (the notify is observational).

**Idempotency:** the v2 handler update is guarded by
`status IN ('scheduled', 'confirmed')`. A replay hits the
same row in `completed` state and the update is a no-op.

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

### 2.5 module-reminder-scheduler  — REMOVED in Sprint 10 I-1

The v1 `module-reminder-scheduler.json` cron workflow is
**deleted** in Sprint 10 I-1. It scanned `module_bookings`,
which no longer exists in the v2 schema; its v1 emit types
(`module_booking_confirmed`, `reminder_24h`, `reminder_1h`)
are also gone. The v2 replacement is the **webhook-driven**
`session-reminder-scheduler.json` (workflow 10, §2.10) —
the Next.js cron `POST /api/cron/send-reminders` is the
authoritative scheduler; n8n is the renderer.

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

### 2.8 admin-notification  (`admin-notification.json`) — Sprint 10 I-1

**Trigger:** Internal — called from 2.1, 2.2, 2.3, 2.6, 2.7.

**Steps (Sprint 10 I-1 v2):**
1. **Verify webhook secret.**
2. **Send admin notification** via
   `POST ${NEXT_PUBLIC_SITE_URL}/api/n8n/notify` with body
   `{ type: 'email', template: 'admin_dead_letter' (or
   'admin_booking_confirmed' / 'admin_booking_cancelled' /
   'admin_booking_rescheduled'), locale: 'en', workflow: <name>,
   props: { workflow, errorMessage, originalEvent } }`.
   The workflow does NOT supply a `to` field — the recipient
   is **hard-coded server-side** in
   `apps/web/lib/constants/index.ts` (`ADMIN_NOTIFY_EMAIL`).
   This eliminates the v1 attack class where a forged `to`
   address on the body could leak a digest to an attacker.

---

### 2.9 tutor-notification  (`tutor-notification.json`)

**Trigger:** Internal — called from 2.2 (module-booking-to-zoom).

**Steps:**
1. **Send Resend email** to tutor with student name, course
   title, module title, scheduled time, and host `start_url`
   (host-only Zoom link).

---

### 2.10 session-reminder-scheduler  (`session-reminder-scheduler.json`) — Sprint 5 Slice E

**Trigger:** n8n Webhook — `POST /webhook/session-reminder-dispatch`,
called from Next.js's `POST /api/cron/send-reminders` (operator
scheduler — Vercel Cron, an external cron service, GitHub
Actions scheduled workflow, or `cron` + curl on the operator
host).

**Steps:**
1. **Verify webhook secret.** The `x-webhook-secret` header must
   match `N8N_WEBHOOK_SECRET`; the body's `type` must be
   `reminder_dispatch`. Anything else → dead-letter.
2. **Acknowledge dispatch.** POST
   `${NEXT_PUBLIC_SITE_URL}/api/webhooks/n8n` with
   `{ type: 'reminder_dispatch', session_booking_id, window }`.
   Next.js looks up the booking's `student_id` and inserts a
   row into `notifications` keyed by
   `user_id, type, payload->>'booking_id', channel`. The
   `uq_notifications_dedupe` UNIQUE index guarantees one row
   per (student, window, booking). A 23505 from this index
   returns `{ duplicate: true }` to n8n.
3. **Skip if duplicate.** When the acknowledgement says the
   dedup row already exists, the workflow short-circuits and
   responds `{ ok: true }` without calling Resend. This is the
   second line of defence against a duplicate cron tick (the
   first is `webhook_events.event_id` UNIQUE, which is enforced
   on the inbound cron → Next.js call).
4. **Render reminder body.** A Code node renders the email
   inline as a literal HTML string. We do NOT import
   `react-dom/server` here because Next.js 15 forbids it in a
   Route Handler module graph, and the React Email templates in
   `apps/web/lib/email/templates/` live behind that import. The
   inline renderer uses the same brand palette
   (`#1f4e8a` / `#f6f4ef` / `#ffffff`) and produces both
   `text/plain` and `text/html` parts.
5. **Send via Resend.** `POST https://api.resend.com/emails`
   with `Authorization: Bearer ${RESEND_API_KEY}`,
   `from = ${RESEND_FROM_EMAIL}`, and the rendered body.
6. **Record `reminder_sent`.** POST back to
   `${NEXT_PUBLIC_SITE_URL}/api/webhooks/n8n` with
   `{ type: 'reminder_sent', session_booking_id, channel,
   type_name }` so the existing v1 `reminder_sent` case in the
   Next.js webhook writes a second `notifications` row keyed on
   `(user_id, 'reminder_24h'|'reminder_1h', booking_id,
   'email')`. (This is the existing convention — the v1
   workflow relied on it for observability.) The second
   notifications row hits the same `uq_notifications_dedupe`
   UNIQUE index; the `reminder_dispatch` step already inserted
   one row at step 2, so the v2 cron-side dedup is what
   actually gates the send. The `reminder_sent` insert is
   `continueOnFail: true` so a duplicate row here does not
   break the workflow.
7. **Respond OK.**

**Failure modes:**
- Step 2 fails (network or 5xx) → workflow continues anyway
  (the operator will see a `duplicate` outcome in the cron log
  on the next tick).
- Step 5 (Resend) fails → workflow dead-letters via the
  `admin-notification` (workflow 8) with the original event.
- The cron service can be invoked more frequently than the
  reminder window (e.g. every 5 minutes) — the dedup layer
  keeps the system safe.

**Env vars on n8n:**
- `N8N_WEBHOOK_SECRET` — shared with Next.js.
- `NEXT_PUBLIC_SITE_URL` — the Next.js deployment origin.
- `RESEND_API_KEY` — Resend credential (not the same as
  Next.js's `RESEND_API_KEY`; n8n has its own).
- `RESEND_FROM_EMAIL` — sender.
- `ADMIN_NOTIFY_EMAIL` — destination for dead-letter.

**Why this lives in n8n (and not in Next.js)**
---------------------------------------------
Per CLAUDE.md §2.3, "n8n is the only system that calls external
APIs on the booking path." Next.js 15 also forbids importing
`react-dom/server` into a Route Handler module graph, even via
dynamic `await import()` — and the React Email templates in
`apps/web/lib/email/templates/` depend on
`renderToStaticMarkup` from `react-dom/server`. So the slice is
split:

- **Next.js cron** (`apps/web/services/admin/reminders.ts` +
  `app/api/cron/send-reminders/route.ts`) — scans
  `session_bookings`, mints a deterministic
  `event_id = reminder-<window>-<booking_id>`, and POSTs a
  `reminder_dispatch` event to n8n's webhook. No email
  rendering.
- **n8n workflow** (this file) — receives the dispatch,
  acknowledges via the `notifications` UNIQUE index, renders
  the email body inline, and calls Resend.

The v1 `module-reminder-scheduler.json` (`§2.5`) is **deprecated
after Sprint 3.5** — it scans `module_bookings`, which no
longer exists post-Sprint-3.5 (the v2 table is
`session_bookings`). The v1 workflow's `module_booking_id` and
`/api/n8n/notify` paths are broken; this v2 workflow replaces
them.

---

### 2.11 POST /api/enrollments/by-calendly-invitee (Next.js → resolver) — Sprint 10 I-1

**Trigger:** n8n workflow 2 (`module-booking-to-zoom`) POSTs
the Calendly `invitee.created` payload to this Next.js route
to resolve the v2 `session_booking_id` for the invitee.

**Auth:** `x-webhook-secret` must equal `N8N_WEBHOOK_SECRET`.
The route is admin-client-backed (n8n is a trusted system, not
a student).

**Inputs:**
- `calendly_invitee_uri` (URL, required)
- `calendly_event_uri` (URL, optional — defence-in-depth
  against a workflow bug that resolves to the wrong event)

**Output (200):** the full `BookingContext`:
`{ ok: true, data: { session_booking_id, session_id,
session_grant_id, student_id, tutor_id, session_title,
course_title, student_name, tutor_name, scheduled_start,
scheduled_end, timezone, duration_min, join_url } }`.

**Privacy:** the response does NOT include the student's
email. n8n does not need it to create a Zoom meeting, and
emitting it would create a needless PII surface.

**Failure modes:**
- 401 — `x-webhook-secret` mismatch.
- 400 — body validation (Zod).
- 404 — no `session_bookings` row matches the
  `calendly_invitee_uri`. This is the normal case for a
  brand-new invitee (the Calendly embed has not been wired
  to `POST /api/session-bookings` yet). The workflow
  short-circuits.
- 409 — `calendly_event_uri` supplied but does not match the
  row's `calendly_event_uri`. The workflow dead-letters.

**Idempotency:** the lookup is keyed on the UNIQUE
`session_bookings.calendly_invitee_uri`. A replay returns
the same row.

---

### 2.12 POST /api/n8n/notify (Next.js → email renderer) — Sprint 10 I-1

**Trigger:** any v2 n8n workflow that wants to send a
booking-path email (workflows 1, 2, 3, 4, 6, 7, 8, 9).

**Auth:** `x-webhook-secret` must equal `N8N_WEBHOOK_SECRET`.

**Discriminated-union body:**
- `{ type: 'email', template: <TEMPLATE>, to?: <email>,
  locale: 'en' | 'fr', workflow?: <name>, props: { ... } }`
  where `TEMPLATE` is one of the v2 templates
  (`session_booking_confirmed`, `session_booking_cancelled`,
  `session_booking_rescheduled`, `session_completed`,
  `session_grant_checkout_created`,
  `session_grant_payment_succeeded`,
  `session_grant_refund_succeeded`, `admin_dead_letter`,
  `admin_booking_confirmed`, `admin_booking_cancelled`,
  `admin_booking_rescheduled`). v1 aliases
  (`module_booking_confirmed`, `module_booking_cancelled`,
  `module_booking_rescheduled`, `module_completed`,
  `enrollment_checkout_created`, `enrollment_refund_succeeded`)
  are accepted for one release so the v1-shaped workflows
  that have not yet been re-authored still work.
- `{ type: 'email_tutor', to: <email>, subject: <string>,
  body: <string>, session_booking_id?: <uuid> }` — the
  tutor email body is supplied verbatim by n8n; the route
  only minimal-escapes for the HTML part.

**Recipient safety (admin_* templates):** the recipient is
hard-coded to `ADMIN_NOTIFY_EMAIL` (constant in
`apps/web/lib/constants/index.ts`). The body's `to` field is
IGNORED for these templates. The constant is a sibling of
`SUPPORT_EMAIL` and is not a `process.env` lookup, so it
is never influenced by a request body or by a misconfigured
`.env`.

**Resend configuration:** if `RESEND_API_KEY` or
`RESEND_FROM_EMAIL` is unset, the route returns
`200 { ok: true, skipped: 'resend_unset' | 'resend_from_unset' }`
so a replay does not re-throw.

**Failure modes:**
- 401 — secret mismatch.
- 400 — Zod validation (`type` discriminator, template
  enum, missing `to` on non-admin template, missing
  `subject` on `email_tutor`).
- 502 — Resend 4xx/5xx.

**Idempotency:** the route is **not** idempotent on its own
(the dedup is upstream in `webhook_events` /
`notifications`). Replays are tolerated because the
notification row UNIQUE indices reject them; the renderer
itself just re-attempts the Resend call.

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

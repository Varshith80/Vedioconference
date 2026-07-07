# Booking Flow (End-to-End)

> A line-by-line walkthrough of every step of a booking, with
> the input, output, API, database write, external service,
> failure scenario, retry, and rollback for each step.

## Overview

```
Student → Course → Calendly → Stripe → n8n → Zoom → Resend → Supabase → Dashboard
```

The flow is **idempotent at every hop**: a replayed event never
creates a duplicate meeting, never charges a card twice, and never
sends a duplicate email.

## Step 1 — Student picks a course

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

## Step 2 — Student picks a slot (Calendly embed)

| Field | Value |
|---|---|
| Input | Time slot click |
| Output | Calendly fires `invitee.created` webhook |
| API | n8n endpoint `POST /webhook/calendly` (added in this review) |
| Database | none yet |
| External service | Calendly |
| Failure | Calendly 5xx → user sees "try another slot" |
| Retry | Calendly retries its own webhooks |
| Rollback | n/a |

## Step 3 — n8n creates a `pending_payment` booking

| Field | Value |
|---|---|
| Input | Calendly event payload |
| Output | `bookings` row with `status='pending_payment'` |
| API | Supabase admin insert |
| Database | `INSERT INTO bookings (...) RETURNING id` |
| External service | none |
| Failure | Supabase 5xx → Calendly webhook retries |
| Retry | n8n Retry-on-fail node (3 attempts) |
| Rollback | none (the row is the anchor for everything else) |

**Idempotency:** the row key is `calendly_event_uri` + a
`UNIQUE(calendly_invitee_uri)` constraint added in migration 8.
Replays return the existing `booking_id`.

## Step 4 — Student pays (Stripe)

| Field | Value |
|---|---|
| Input | Browser redirected to Stripe Checkout |
| Output | Stripe-hosted payment page |
| API | n8n calls Stripe (`POST /v1/checkout/sessions`) using
  `idempotency_key = booking.id` and `client_reference_id = booking.id` |
| Database | `UPDATE bookings SET stripe_session_id=…` |
| External service | Stripe |
| Failure | Stripe 5xx → user stays on `cancel_url`; booking stays
  `pending_payment` |
| Retry | Stripe SDK built-in retry (3 attempts) |
| Rollback | none yet |

## Step 5 — Stripe sends `checkout.session.completed`

| Field | Value |
|---|---|
| Input | Stripe webhook payload, signed |
| Output | `payments.status='succeeded'`, `bookings.status='pending_payment'` |
| API | `POST /api/webhooks/stripe` (added in this review) |
| Database | `INSERT INTO webhook_events (...)`, then `UPDATE payments`,
  then `UPDATE bookings` |
| External service | Stripe |
| Failure | signature invalid → 401, no DB mutation; transient
  error → 5xx, Stripe retries |
| Retry | Stripe policy (up to 3 days) |
| Rollback | none |

**Idempotency:** `webhook_events.event_id` is `UNIQUE`. A replay
returns 200 with no work done.

## Step 6 — n8n creates the Zoom meeting

| Field | Value |
|---|---|
| Input | Stripe webhook → n8n (`payment-to-zoom`) |
| Output | Zoom meeting created, `meeting_links` row inserted |
| API | `POST /users/{zoom_user_id}/meetings` (Server-to-Server OAuth) |
| Database | `INSERT INTO meeting_links (...)` |
| External service | Zoom |
| Failure | Zoom 5xx → n8n retries with backoff; final failure →
  `n8n_dead_letters` row + admin email; booking stays
  `pending_payment` (UI shows "meeting is being prepared") |
| Retry | n8n Retry-on-fail (3 attempts) |
| Rollback | if the DB insert fails after the Zoom meeting was
  created, a periodic reconciliation subflow
  (`delete-orphan-meetings`) cleans up |

**Idempotency:** the lookup is keyed on `booking_id`; the
`meeting_links.booking_id` is `UNIQUE`. A replay returns the
existing meeting.

## Step 7 — Confirmation email (Resend)

| Field | Value |
|---|---|
| Input | n8n internal `confirmation-email` workflow |
| Output | Resend accepts the email, a `notifications` row is written |
| API | `POST /v1/emails` |
| Database | `INSERT INTO notifications (type='booking_confirmed', channel='email')` |
| External service | Resend |
| Failure | Resend 4xx → log + admin email + user sees a banner; Resend
  5xx → n8n retries (3 attempts), final failure → dead-letter |
| Retry | n8n Retry-on-fail |
| Rollback | none |

## Step 8 — Reminder emails (T-24h, T-1h)

| Field | Value |
|---|---|
| Input | n8n Cron, every 15 min |
| Output | Resend email + `notifications` row |
| API | Resend |
| Database | `INSERT INTO notifications (type='reminder_24h' \| 'reminder_1h')` |
| External service | Resend |
| Failure | n8n retries; final failure → dead-letter |
| Retry | n8n Retry-on-fail |
| Rollback | none |

**Idempotency:** the SQL query in `WORKFLOWS.md` §2.4 now uses
`NOT EXISTS` against the `notifications` table for the same
`booking_id` + `type` pair, so a slow run cannot double-send.

## Step 9 — Student attends the class

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

## Step 10 — Class completes

| Field | Value |
|---|---|
| Input | n8n timer (or manual admin action) |
| Output | `bookings.status='completed'` |
| API | Supabase update |
| Database | `UPDATE bookings SET status='completed' WHERE id=$1` |
| External service | none |
| Failure | Supabase 5xx → retry |
| Retry | n8n Retry-on-fail |
| Rollback | none |

## Step 11 — Resource grants (if any)

| Field | Value |
|---|---|
| Input | post-completion |
| Output | `resource_grants` rows for the booking |
| API | Supabase insert (admin) |
| Database | `INSERT INTO resource_grants (...)` |
| External service | none |
| Failure | log; admin can retry from the panel |
| Retry | n/a (manual) |
| Rollback | none |

## Step 12 — Cancellation / Reschedule

- **Cancellation** (student or admin): `bookings.status='cancelled'`,
  `cancelled_at`, Stripe refund (full or partial depending on
  time-to-start), Zoom meeting deleted, email sent.
- **Reschedule:** old booking `status='rescheduled'`, new booking
  linked via `rescheduled_from`, new Zoom meeting, new email,
  Stripe credit if outside the policy window.

Both flows are idempotent on `booking_id`.

## Race conditions considered

- **Double-booking a tutor:** prevented by the new trigger
  `bookings_no_overlap_per_tutor` (a tutor cannot have two
  `confirmed` bookings whose time ranges overlap).
- **Paying twice for the same booking:** prevented by the
  `stripe_session_id UNIQUE` constraint on `bookings`.
- **Webhook replay:** prevented by `webhook_events.event_id UNIQUE`.
- **Reminder duplicate:** prevented by `notifications` UNIQUE on
  `(user_id, type, booking_id, channel)` (added in migration 8).

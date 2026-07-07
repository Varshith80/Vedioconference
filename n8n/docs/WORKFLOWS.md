# n8n Workflow Plan

> ⚠️ **Phase 1 deliverable** — these workflows are **designed and documented
> but NOT yet implemented**. Implementation begins in Phase 3 once the
> Next.js data model and Supabase schema are live.

This document describes every workflow that lives in n8n. n8n is the
**automation layer** that wires together the third-party SaaS tools
(Calendly, Stripe, Zoom, Resend) and pushes the resulting state back to
Supabase.

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

## 1. Workflow inventory

| # | Workflow                       | Trigger                           | Outputs (writes to)               |
|---|--------------------------------|-----------------------------------|-----------------------------------|
| 1 | Booking → Payment              | Calendly `invitee.created`        | supabase `bookings`, stripe session|
| 2 | Payment → Zoom                 | Stripe `checkout.session.completed` | supabase `meeting_links`        |
| 3 | Confirmation Email             | n8n internal (chain from 2)       | resend, supabase `notifications`  |
| 4 | Reminder (T-24h, T-1h)         | n8n Cron                          | resend                            |
| 5 | Reschedule                     | Calendly `invitee.updated`        | supabase `bookings`, stripe refund|
| 6 | Cancellation                   | Calendly `invitee.canceled`       | supabase `bookings`, stripe refund|
| 7 | Admin Notification (new booking)| n8n internal (chain from 1)       | resend to admin                   |
| 8 | Tutor Notification             | n8n internal (chain from 2)       | resend to tutor                   |

---

## 2. Workflow details

### 2.1 Booking → Payment  (`booking-to-payment.json`)

**Trigger:** Calendly Webhook — `invitee.created`

**Inputs (from Calendly):**
- `event`           : event type URI
- `invitee.uri`     : invitee URI
- `invitee.name`, `invitee.email`
- `event.start_time`, `event.end_time`
- `tracking.utm_*`

**Steps:**
1. **Validate** payload (Zod equivalent / `if` node).
2. **Lookup tutor** in Supabase by `calendly_event_uri`.
3. **Lookup course** in Supabase by `event_type.name` mapping.
4. **Create / update booking** in Supabase (`status='pending_payment'`).
5. **Create Stripe Checkout Session** with metadata `{ booking_id }`.
6. **Reply to Calendly invitee** (or send custom Resend email) with the
   Stripe payment link.
7. **Update Supabase booking** with `stripe_session_id`.

**Failure modes:**
- Tutor not found → admin notification + dead-letter Supabase row.
- Stripe error → booking kept as `pending_payment`; admin notified.

---

### 2.2 Payment → Zoom  (`payment-to-zoom.json`)

**Trigger:** Stripe Webhook — `checkout.session.completed`

**Steps:**
1. **Verify signature** with `STRIPE_WEBHOOK_SECRET`.
2. **Lookup booking** by `session.metadata.booking_id`.
3. **Update payment row** (`status='succeeded'`, store payment_intent).
4. **Create Zoom meeting** via Zoom Server-to-Server OAuth (`POST
   /users/{user_id}/meetings`) with `topic = course title`,
   `start_time`, `duration`.
5. **Insert `meeting_links` row** in Supabase.
6. **Update booking** to `status='confirmed'`.
7. **Trigger Confirmation Email workflow.**

---

### 2.3 Confirmation Email  (`confirmation-email.json`)

**Trigger:** Internal — invoked by 2.2 (or directly by 1 if no Zoom).

**Inputs:** `booking_id`.

**Steps:**
1. Fetch booking + course + meeting link from Supabase.
2. Render React Email template `BookingConfirmed`.
3. Send via Resend.
4. Insert a `notifications` row (in-app mirror).

---

### 2.4 Reminder (T-24h and T-1h)  (`reminder-scheduler.json`)

**Trigger:** n8n Cron — every 15 minutes.

**Steps:**
1. Query Supabase for bookings where:
   - `status = 'confirmed'`
   - `scheduled_start BETWEEN now()+24h AND now()+24h+15m`  (T-24h)
   - OR `scheduled_start BETWEEN now()+1h AND now()+1h+15m`  (T-1h)
   - AND no `notifications` row with `type='reminder_24h'` / `reminder_1h` exists.
2. For each booking, send a Resend email with the join link.
3. Insert a `notifications` row to mark the reminder as sent.

---

### 2.5 Reschedule  (`reschedule.json`)

**Trigger:** Calendly Webhook — `invitee.updated` with new start_time.

**Steps:**
1. Lookup old booking by `calendly_invitee_uri`.
2. **Create new booking row** linked via `rescheduled_from`.
3. **Void** the old Zoom meeting (`DELETE /meetings/{id}`).
4. **Create** a new Zoom meeting.
5. **Issue Stripe credit** (refund if outside policy window) via
   `refunds.create`.
6. Send Resend email with new join link.
7. Update old booking `status='rescheduled'`.

---

### 2.6 Cancellation  (`cancellation.json`)

**Trigger:** Calendly Webhook — `invitee.canceled` **OR** direct call from
`POST /api/bookings/[id]/cancel`.

**Steps:**
1. Lookup booking.
2. Update booking `status='cancelled'`, `cancelled_at`, `cancelled_reason`.
3. **Delete Zoom meeting** (`DELETE /meetings/{id}`).
4. **Refund payment** (full or partial depending on `scheduled_start`).
5. Send Resend email confirming the cancellation.
6. Send admin notification (workflow 7).

---

### 2.7 Admin Notification  (`admin-notification.json`)

**Trigger:** Internal — called from 1, 2, 5, 6.

**Steps:**
1. Compose digest or per-event email.
2. Send via Resend to `ADMIN_EMAIL` (env var on n8n).

---

### 2.8 Tutor Notification  (`tutor-notification.json`)

**Trigger:** Internal — called from 2 (Payment → Zoom).

**Steps:**
1. Send Resend email to tutor with student name, course, and host
   `start_url` (host-only Zoom link).

---

## 3. Shared credentials (n8n)

| Credential          | Type          | Scope                                        |
|---------------------|---------------|----------------------------------------------|
| `supabase_admin`    | Header Auth   | `apikey: $SUPABASE_SERVICE_ROLE_KEY`         |
| `stripe`            | Stripe API    | Restricted key with `checkout + refunds`     |
| `zoom_oauth`        | OAuth2        | Server-to-Server app, `meeting:write` scope  |
| `calendly_pat`      | Header Auth   | `Bearer $CALENDLY_PERSONAL_TOKEN`            |
| `resend`            | Header Auth   | `Authorization: Bearer $RESEND_API_KEY`      |

---

## 4. Failure handling

- Every node that mutates external state is wrapped in a **Retry on
  Fail** node (3 attempts, exponential backoff).
- After final failure, the booking row is annotated with
  `metadata.last_error` and a row is inserted into a dead-letter
  Supabase table (`n8n_dead_letters`).
- The admin notification workflow subscribes to that table via
  Realtime and surfaces failures in the admin dashboard.

---

## 5. Observability

- Each workflow writes a row to a Supabase `n8n_executions` table
  (created in a follow-up migration) with start/end timestamps, node
  counts, and a status (`ok` / `error`).
- The admin dashboard reads this table to display a 7-day execution
  timeline.

---

## 6. Versioning

Every workflow is exported as JSON and committed under
`n8n/workflows/`. The deploy script (`scripts/deploy-n8n.sh`) uses
`n8n import:workflow --input=<file>` to install or update workflows in
the target environment.

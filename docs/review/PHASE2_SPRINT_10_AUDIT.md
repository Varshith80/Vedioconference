# Phase 2 — Sprint 10 — Planning / Audit (READ-ONLY)

**Audit date.** 2026-09-12.
**Audit author.** Sprint 9 close-out + this audit session.
**Tag.** **No tag.** This is a read-only planning document. No code
or migration is written by this session. No commit, no push, no tag.
**Status.** Audit complete. Sprint 10 implementation is GATED on
explicit user approval of the scope proposed in §O.

---

## 0. How to read this document

This is a **read-only** planning document. It does not implement
Sprint 10. It does not modify any source file, migration, or
environment. It does not start a sprint tag, push a commit, or
touch remote Supabase / n8n / Zoom / Stripe / Calendly / Resend.

The user's pre-flight instruction for this session:

> *"The roadmap indicates Sprint 10 is the GA-blocker sprint:
> 1. I-1 — Real n8n workflow JSON authoring for the booking
>    path. 2. R-3 — Full Zoom recording.completed write-back.
> Do NOT assume that this is the complete scope without
> verifying the repository's authoritative roadmap/plan
> documents."*

The audit reads the authoritative sources
(`docs/DevelopmentRoadmap.md`, `PHASES.md`, `PROJECT_INDEX.md`,
`PROJECT_STATE.md`, `docs/BookingFlow.md`, `n8n/docs/WORKFLOWS.md`,
`DECISIONS.md`, all the existing `n8n/workflows/*.json`, the
existing webhook route handlers, the env schema, the meeting_links
schema, the existing tests, and the existing roadmap / phase
documents) and reconciles them where they disagree.

Where two documents disagree, the contradiction is reported
verbatim and a proposed authoritative source is identified — but
**the scope is not silently chosen**. The user must approve.

---

## A. Authoritative Sprint 10 scope

### A.1 What the user proposed

The user proposed two candidate items:

1. **I-1** — Real n8n workflow JSON authoring for the booking path.
2. **R-3** — Full Zoom `recording.completed` write-back.

### A.2 What the authoritative roadmap / phase documents say

- **`docs/DevelopmentRoadmap.md` Phase 3 (line 55)** — "Booking,
  Stripe, Zoom, Calendly. **Goal:** students can browse a course,
  pick a slot, pay, and receive a Zoom link by email."
  **M3.2 (line 65)** — "n8n workflows live." This is the
  Phase 3 milestone that the user has labelled I-1.
- **`PHASES.md` Phase 3** is currently **`⏳`** (gated). It is
  not started. It contains the same 8 n8n workflows listed in
  `n8n/docs/WORKFLOWS.md §1`.
- **`PROJECT_STATE.md` lines 1059-1060** — "No n8n workflow
  JSON authoring for the deferred Phase 3 workflows" is the
  explicit "deferred to Phase 3" line that this audit is the
  pre-work for.
- **`PROJECT_STATE.md` lines 1030-1035** — S8-D's "What is
  explicitly NOT in S8-D" lists the Zoom
  `recording.completed` → n8n → `meeting_links.recording_url`
  write-back workflow and defers it to "a Phase 3 sprint."

### A.3 Proposed Sprint 10 scope (subject to user approval)

**I-1 (PRIMARY).** Author the 8 v2 n8n workflow JSON files
specified in `n8n/docs/WORKFLOWS.md §1` against the **Sprint 3.5
session-based schema** (replacing the v1 placeholder JSONs that
ship in `n8n/workflows/` today). The 8 workflows are:

| # | Workflow | Trigger | Today |
|---|---|---|---|
| 1 | `enrollment-created` | `POST /webhook/enrollment-created` from Next.js checkout route | partial — sends v1 keys to Next.js (`enrollment_id`, `enrollment_checkout_created`) |
| 2 | `module-booking-to-zoom` (renamed to `session-booking-to-zoom` in §2.2 docs but file unchanged) | Calendly `invitee.created` (forwarded by Next.js) | partial — body uses `module_booking_id` field name (v1), persists `meeting_created` (v2 type, OK) |
| 3 | `module-completed` (renamed to `session-completed` in §2.3 docs but file unchanged) | n8n-internal (or Zoom `meeting.ended`) | **broken** — emits `module_completed` type and v1 field names; the n8n webhook handler in Next.js removed v1 back-compat in Sprint 3.6, so this workflow is non-functional today |
| 4 | `module-confirmation-email` | n8n-internal (chain from 2) | partial — uses v1 field names in the email body |
| 5 | `module-reminder-scheduler` | n8n Cron (every 15 min) [v1 only] | **deprecated and broken** post-Sprint 3.5 — superseded by `session-reminder-scheduler` (Sprint 5 Slice E) |
| 6 | `module-reschedule` | Calendly `invitee.updated` | partial — uses `module_rescheduled` type, v1 field names |
| 7 | `module-cancellation` | Calendly `invitee.canceled` / `POST /api/session-bookings/[id]/cancel` | partial — uses `module_cancelled` type, v1 field names |
| 8 | `admin-notification` | n8n-internal dead-letter | partial — only sends `admin_dead_letter`; no other template branching |
| 9 | `tutor-notification` | n8n-internal chain from 2 | partial — uses `email_tutor` type which is **not handled** in the Next.js n8n webhook handler |
| 10 | `session-reminder-scheduler` | Webhook from Next.js cron `POST /api/cron/send-reminders` | **real and live** — the only n8n workflow actually deployed today (Sprint 5 Slice E) |

**R-3 (SECONDARY, GATED on a separate schema-change
authorisation).** Full Zoom `recording.completed` write-back. This
**requires** the forward-only migration
`meeting_links.recording_url text NOT NULL` (S8-D's migration
that was dropped in Sprint 8). R-3 also requires a new n8n
workflow `zoom-recording-completed` (not yet in the 8-workflow
list) AND a new Next.js webhook route `app/api/webhooks/zoom/`
which does not exist today.

### A.4 Two contradictions the user must resolve

#### Contradiction #1 — `WORKFLOWS.md` line 499-500 vs the actual JSON files

> *"The Sprint B2 JSON files are still Phase 1 placeholders; they
> will be replaced when the workflows are implemented in Phase 3."*

The JSON files in `n8n/workflows/` are **not** placeholders. They
are real, complete, syntactically valid n8n workflow exports with
real `HttpRequest` nodes, real `RespondToWebhook` nodes, real
error branches, real body parameter mappings, and real
`$env.N8N_WEBHOOK_SECRET` references. They are all set to
`"active": false`, all tagged `phase-3`, and they all use **v1
field names** (`module_booking_id`, `module_id`, `enrollment_id`)
that no longer exist in the v2 schema (Sprint 3.5 renamed them
to `session_booking_id`, `session_id`, `session_grant_id`).

**Authoritative source recommendation.** The actual JSON files
take precedence over the doc. The doc is stale (it still
describes the v1 placeholder/real distinction, but the v1
placeholders have already been replaced by the current v1-shaped
real JSONs). The current state is "v1-shaped real workflows,
inactive, broken against the v2 schema."

#### Contradiction #2 — `PROJECT_STATE.md` line 1059 vs `WORKFLOWS.md` line 73

- `PROJECT_STATE.md` line 1059 — "No n8n workflow JSON authoring
  for the deferred Phase 3 workflows" implies "no Phase 3 work
  has happened."
- `WORKFLOWS.md` line 73 — workflow #5 is documented as
  "v1 only — see §2.10" and `module-reminder-scheduler.json` is
  documented as "v1, broken post-Sprint 3.5" — meaning the v1
  workflow exists and is broken, not that it doesn't exist.

These are not actually contradictory once you read them
together: the v1 JSONs exist, are inactive, and are broken; no
v2 / Phase 3 JSONs have been authored. The audit reports this
for clarity but does not require user resolution.

### A.5 R-3 is gated on its own user authorisation

Sprint 8 dropped S8-D because the `meeting_links.recording_url`
column did not exist. R-3's full Zoom write-back cannot ship
without that column. The user has already indicated (per
`PROJECT_STATE.md` line 1065) that the migration is NOT written.
If R-3 is in-scope for Sprint 10, the user must authorise the
forward-only migration in this same sprint. If the user prefers
to keep S8-D-style read-only behaviour (a separate, later sprint
that just adds the column and the read-path), R-3 is **out of
scope** for Sprint 10.

---

## B. Current state (the audit baseline)

### B.1 What already exists in the repo

**Database (Supabase, applied migrations).**
- `public.session_bookings` — the v2 unit of a live session
  (`20260714000003_session_bookings_meeting_links_payments.sql`).
  Has `session_grant_id`, `session_id`, `tutor_id`, `student_id`,
  `status`, `scheduled_start`, `scheduled_end`, `timezone`,
  `calendly_event_uri`, `calendly_invitee_uri UNIQUE`, `notes`,
  `cancelled_at`, `cancelled_reason`, `rescheduled_from`,
  `metadata`, `created_at`, `updated_at`. The
  `session_bookings_time_order` CHECK constraint enforces
  `scheduled_end > scheduled_start`. RLS is on: students can
  SELECT and UPDATE (cancel-only), admins can do all.
- `public.meeting_links` — has the original v1 columns plus
  `session_booking_id` (nullable, FK to `session_bookings`).
  UNIQUE partial index on `session_booking_id` (one meeting per
  booking). **No `recording_url` column.**
- `public.payments` — has the original v1 columns plus
  `session_grant_id` (nullable, FK to `session_grants`).
- `public.webhook_events` — `(provider, event_id) UNIQUE`
  dedup. Already populated for Stripe, Calendly, and n8n.
- `public.notifications` — UNIQUE
  `(user_id, type, payload->>'booking_id', channel)` dedup.
- `public.n8n_dead_letters` — observability table for n8n
  workflow failures. `workflow_failed` case in the n8n webhook
  handler inserts here.
- `public.session_grants` — v2 grant table (Sprint 3.5 +
  Sprint 5 slices A, B, C). Has `stripe_session_id` for the
  Stripe Checkout Session id persistence.

**Next.js route handlers (apps/web/app/api/).**
- `webhooks/stripe/route.ts` — Stripe signature verification +
  `webhook_events` dedup + handles
  `checkout.session.completed`,
  `payment_intent.payment_failed`, `charge.refunded` for the
  v2 `session_grant_id` metadata. v1 back-compat removed in
  Sprint 3.6.
- `webhooks/calendly/route.ts` — Calendly `Calendly-Webhook-Signature`
  HMAC verification + `webhook_events` dedup + fire-and-forget
  POST to `N8N_ENROLLMENT_WEBHOOK_URL/calendly` with the
  `invitee.created` body. Logs when the env var is unset
  ("mock mode").
- `webhooks/n8n/route.ts` — `x-webhook-secret` shared-secret
  check + `webhook_events` dedup (when `body.event_id` is
  present) + handles the v2 event types:
  `meeting_created`, `session_grant_checkout_created`,
  `session_grant_refund_succeeded`,
  `session_booking_confirmed`,
  `session_booking_cancelled`, `payment_succeeded`,
  `payment_failed`, `reminder_dispatch`, `reminder_sent`,
  `workflow_failed`. v1 back-compat removed in Sprint 3.6.
- `cron/send-reminders/route.ts` — `x-webhook-secret` check +
  parallel `runReminderWindow('24h')` + `runReminderWindow('1h')`.
  The service mints deterministic `event_id`s
  `reminder-<window>-<booking_id>` for dedup.
- `cron/check-tutor-change-sla/route.ts` — separate
  tutor-change SLA cron, NOT in scope for Sprint 10.
- `session-bookings/route.ts` — POST to create a
  `session_booking` (with `createSessionBooking()` service
  call). Sprint 3.5 endpoint.
- `session-bookings/[id]/cancel/route.ts` — POST to cancel.
  The v1 `enrollments/cancel` route is gone (Sprint 3.6).
- **No `webhooks/zoom/` route exists.** Zoom S2S OAuth
  credentials are provisioned in `lib/env.ts` (`ZOOM_ACCOUNT_ID`,
  `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`,
  `ZOOM_DEFAULT_HOST_USER_ID`) but no inbound Zoom webhook is
  registered. This is the R-3 gap.

**n8n workflows (n8n/workflows/).**

10 files exist on disk; 1 is real and live (`session-reminder-scheduler`),
9 are inactive (`"active": false`) and tagged `phase-3`.

| File | Real JSON? | Active? | v1/v2 shape? | Handled by Next.js? |
|---|---|---|---|---|
| `enrollment-created.json` | yes | no | v1 (`enrollment_id`, `enrollment_checkout_created`) | **No** — the v1 `enrollment_checkout_created` case was removed in Sprint 3.6 |
| `module-booking-to-zoom.json` | yes | no | mixed — v1 input field names (`module_booking_id`) but v2 output type (`meeting_created`) | **Partially** — `meeting_created` IS handled, but the body field name from Calendly is v1 (`module_booking_id`) |
| `module-completed.json` | yes | no | v1 (`module_completed`, `module_booking_id`) | **No** — `module_completed` is not a recognised case; logs `Unknown n8n webhook event type` and 200s |
| `module-confirmation-email.json` | yes | no | v1 input; calls `/api/n8n/notify` (route does not exist) | **No** — `/api/n8n/notify` does not exist; `email_tutor` type is not handled |
| `module-reminder-scheduler.json` | yes | no | v1 | n/a — superseded |
| `module-reschedule.json` | yes | no | v1 (`module_rescheduled`) | **No** — case removed in Sprint 3.6 |
| `module-cancellation.json` | yes | no | v1 (`module_cancelled`); calls non-existent `/api/meetings/by-booking/[id]` | **No** |
| `admin-notification.json` | yes | no | calls `/api/n8n/notify` with `email` type and `admin_dead_letter` template | **No** — `/api/n8n/notify` does not exist |
| `tutor-notification.json` | yes | no | v1; calls `/api/n8n/notify` with `email_tutor` type | **No** — `/api/n8n/notify` does not exist |
| `session-reminder-scheduler.json` | yes | **yes** | v2 (full Sprint 5 Slice E) | **Yes** — every node's body is recognised by Next.js |

**Environment (apps/web/lib/env.ts).**
- Server: `SUPABASE_SERVICE_ROLE_KEY` (required), `STRIPE_*` (optional),
  `ZOOM_*` (optional), `CALENDLY_*` (optional), `RESEND_*`
  (optional), `N8N_BASE_URL` (optional), `N8N_API_KEY`
  (optional), `N8N_WEBHOOK_SECRET` (optional), `N8N_ENROLLMENT_WEBHOOK_URL`
  (optional), `SENTRY_DSN` (optional).
- Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DEFAULT_LOCALE`,
  `NEXT_PUBLIC_DEFAULT_TIMEZONE`, `NEXT_PUBLIC_CALENDLY_URL`,
  `NEXT_PUBLIC_N8N_BOOKING_WEBHOOK`.
- **No `ZOOM_WEBHOOK_SECRET` env var.** A Zoom-verification secret
  would be required for R-3; this is a **R-3 prerequisite**.

**Tests (apps/web/tests/unit/) relevant to the booking path.**
- `reminders-cron-route.test.ts` — auth-only test of
  `POST /api/cron/send-reminders`. Covers the `x-webhook-secret`
  check, env-var-missing guard, and aggregation.
- `reminders-service.test.ts` — `runReminderWindow` service
  tests (n8n-driven, hermetic).
- `session-bookings-route.test.ts` — Sprint 3.5 smoke test for
  `POST /api/session-bookings`.
- `admin-session-bookings-manual-complete.test.ts` — Sprint 8
  B-19 manual-complete.
- **No tests for any of the 8 v1/v2 n8n workflow JSONs.**
  **No tests for `webhooks/calendly`, `webhooks/stripe`, or
  `webhooks/n8n` route handlers** (verified by `Glob` returning
  empty for `**/n8n*.test.*`, `**/webhook*.test.*`,
  `**/zoom*.test.*`).
- The dedup behaviour, signature verification, and event-type
  branching of all three webhooks are un-tested at the route
  level.

### B.2 What is documented but not implemented

- The 8-workflow inventory in `n8n/docs/WORKFLOWS.md §1` (the
  authoritative Phase 3 design).
- The two-tier flow in `docs/BookingFlow.md` (Course
  enrollment → Module booking → Zoom → Resend → Reminders →
  meeting.ended).
- The Zoom OAuth env vars in `lib/env.ts` (the secret side of
  the booking path is provisioned, but no inbound Zoom
  webhook is registered).

### B.3 What is implemented but not in scope for Sprint 10

- Sprint 9 homepage progress card (live in production,
  `v1.9.0-phase2-sprint-9`).
- Sprint 8 sub-sprints A, B, C (live in production,
  `v1.9.0-phase2-sprint-8`).
- The cron / reminder pipeline (live, Sprint 5 Slice E).
- The Stripe Checkout / webhook / refund path (live, Sprint C
  + Sprint 3.5 + Sprint 3.6).
- The Calendly webhook → n8n forwarder (live, Sprint C).

---

## C. Booking flow (current vs target)

### C.1 Current booking path (what actually runs today)

The current path **ends with no Zoom meeting being created**
because the inbound Calendly webhook is forwarded to
`N8N_ENROLLMENT_WEBHOOK_URL/calendly` and that URL, in this
environment, is unset (the n8n production instance is not
configured with a real URL yet). The chain is:

1. **Student enrolls.** `POST /api/session-grants/checkout`
   (or the v1 `POST /api/enrollments`) creates a
   `session_grants` row in `pending_payment` and forwards to
   `N8N_ENROLLMENT_WEBHOOK_URL/enrollment-created`. n8n creates
   the Stripe Checkout Session and POSTs the `checkout_url`
   back. (In dev, the `enrollment-created.json` workflow
   shape is v1 — uses `enrollment_id` and
   `enrollment_checkout_created` type, which Next.js does not
   handle; the v2 replacement is part of the proposed Sprint 10
   I-1 work.)
2. **Student pays.** Stripe sends `checkout.session.completed`
   to `POST /api/webhooks/stripe`. Stripe webhook signature is
   verified, the `session_grant_id` is resolved from metadata,
   the `payments` row is updated, and `markSessionGrantPaid()`
   flips the grant to `active`. (Live and working.)
3. **Student picks a Calendly slot.** The Calendly embed
   fires `invitee.created` to `POST /api/webhooks/calendly`.
   The signature is verified, the event is deduped, and a
   fire-and-forget POST is sent to
   `${N8N_ENROLLMENT_WEBHOOK_URL}/calendly` with the
   `invitee.created` body. (If the n8n URL is unset, the
   Calendly webhook is recorded in `webhook_events` and the
   `invitee.created` body is **dropped on the floor** — no
   Zoom meeting is created, no email is sent.)
4. **n8n `module-booking-to-zoom` runs.** The workflow
   calls `POST /api/enrollments/by-calendly-invitee` to
   resolve the booking context, then `POST
   https://api.zoom.us/v2/users/[id]/meetings` to create the
   Zoom meeting, then `POST /api/webhooks/n8n` with
   `type: meeting_created` to persist the `meeting_link` and
   flip the `session_bookings.status` to `confirmed`. (The
   first hop — `/api/enrollments/by-calendly-invitee` — does
   not exist in the current `app/api/` tree; see §B.1. The
   workflow's first step is therefore broken today.)
5. **Confirmation email.** The `module-confirmation-email`
   workflow (chain from step 4) calls
   `POST /api/n8n/notify`. The route does not exist
   (`/api/n8n/notify` glob returns empty). The email is
   therefore not sent.
6. **Reminders.** 24h and 1h before the session, the
   `POST /api/cron/send-reminders` route fires
   `reminder_dispatch` to the `session-reminder-scheduler`
   n8n workflow, which calls Resend directly and POSTs
   `reminder_sent` back to the n8n webhook. (Live and
   working in the v2 path.)
7. **Zoom meeting ends.** A `meeting.ended` event from Zoom
   would need to be delivered to a Next.js inbound route
   (which does not exist today) to flip the
   `session_bookings.status` to `completed`. (The
   `module-completed` n8n workflow assumes this delivery
   happens; the wiring is missing.)
8. **Session grading / recording.** After the meeting,
   the Zoom `recording.completed` event would need to be
   delivered to a Next.js inbound route (which does not
   exist) which would write the recording URL to
   `meeting_links.recording_url` (which does not exist as a
   column). This is R-3.

### C.2 Target booking path (what Sprint 10 I-1 ships)

After Sprint 10, the path matches `docs/BookingFlow.md`
exactly:

- 8 v2 workflow JSONs, all `active: true`, all v2-shaped
  field names, all event types recognised by
  `webhooks/n8n/route.ts`.
- 1 new Next.js route `POST /api/enrollments/by-calendly-invitee`
  (resolves the booking context from the Calendly invitee URI
  to the `session_bookings.id`).
- 1 new Next.js route `POST /api/n8n/notify` (renders the
  Resend email templates for `module_booking_confirmed`,
  `admin_dead_letter`, `email_tutor`; this is the renderer
  that the v1 `/api/n8n/notify` references in workflows 4, 5,
  8, 9).
- The Calendly forwarder continues to work; the chain to
  Zoom → email → reminder continues unbroken.
- 1 Zoom inbound webhook route `POST /api/webhooks/zoom/`
  (verifies the `x-zm-signature` HMAC, dedups, and flips
  `session_bookings.status` to `completed` on
  `meeting.ended`).
- 1 n8n workflow `zoom-recording-completed` (R-3) — captures
  the `recording.completed` event from Zoom and POSTs to
  Next.js with `type: recording_completed`.

---

## D. Zoom recording flow (R-3)

### D.1 Current state

- No Zoom S2S OAuth code path exists in `apps/web/`. The
  `ZOOM_*` env vars are declared in `lib/env.ts` but no module
  imports them.
- No Zoom inbound webhook route exists at
  `app/api/webhooks/zoom/`.
- `meeting_links` does NOT have a `recording_url` column
  (verified against migration
  `20260714000003_session_bookings_meeting_links_payments.sql`).
- S8-D's planned migration
  (`meeting_links.recording_url text NOT NULL DEFAULT NULL` —
  per the user-approved Sprint 8 plan §4) was never written.
- The n8n inventory does not include a `zoom-recording-completed`
  workflow. It is a **new** workflow to author.

### D.2 Target state (R-3)

1. **Schema change.** Forward-only migration
   `supabase/migrations/<ts>_add_meeting_links_recording_url.sql`:
   - `ALTER TABLE public.meeting_links
        ADD COLUMN IF NOT EXISTS recording_url text;`
   - `COMMENT ON COLUMN public.meeting_links.recording_url IS
        'Zoom cloud recording share_url. Populated by the
         recording.completed n8n workflow (R-3).';`
   - No NOT NULL (the column is nullable; "not yet recorded"
     is a valid state).
2. **Zoom inbound webhook route.**
   `apps/web/app/api/webhooks/zoom/route.ts`:
   - Verifies the `x-zm-signature` HMAC against
     `ZOOM_WEBHOOK_SECRET` using the
     `v0=<hex>` header format documented in
     Zoom's "Verifying Webhook Deliveries" guide.
   - Records the event in `webhook_events` (dedup).
   - Handles `recording.completed`: extracts
     `payload.object.id` (the Zoom meeting id), looks up the
     `meeting_links` row by `meeting_id`, updates
     `recording_url` to `payload.object.share_url` and
     optionally the recording `start_time` / `duration` into
     the `metadata` JSONB column. (No new columns — recording
     metadata beyond the URL lives in the `metadata` JSONB
     that already exists.)
   - Handles `meeting.ended`: flips
     `session_bookings.status` to `completed` (via
     `session_booking_id` joined from the meeting row).
   - Dead-letters on failure (insert into `n8n_dead_letters`
     is the wrong table — that's for n8n; a new table or a
     `zoom_dead_letters` view is the cleanest answer, but the
     audit leaves the naming choice to the implementation
     sprint).
3. **n8n workflow `zoom-recording-completed`.**
   - Trigger: Zoom webhook delivery to n8n (NOT Next.js —
     the n8n instance is registered as the Zoom webhook
     endpoint, and n8n forwards to Next.js). The alternative
     architecture (Zoom → Next.js directly) is also valid;
     the user-approved Sprint 8 plan §S8-D says "the
     recording.completed → n8n → meeting_links write-back
     workflow" which means **Zoom → n8n → Next.js**.
   - Steps: verify Zoom signature, extract meeting id and
     share URL, POST to `/api/webhooks/zoom/` with
     `{ type: 'recording_completed', zoom_meeting_id,
       recording_url, ... }`. Or: n8n owns the write-back
     directly (POSTs to `/api/webhooks/n8n` with
     `{ type: 'recording_persisted', session_booking_id,
       recording_url }`). The choice is between "Next.js
     owns the write" and "n8n owns the write" — both are
     defensible, neither is documented, and **the user must
     approve**.
4. **New env var.** `ZOOM_WEBHOOK_SECRET` — required for the
   new inbound route. The user must authorise the
   `.env.example` rotation.
5. **Read-path surface.** Once the column exists, the
   student session-detail page and the admin
   session-booking-detail page read
   `meeting.recording_url` and render an `<a>` to the
   share URL when present, "Recording not available yet"
   when null. This is the S8-D read-path; if the user
   scopes R-3 to "write only" (no UI surfacing), this
   step is deferred to a later sprint.

### D.3 Why R-3 is gated separately

Per the user's pre-flight instructions and the user's prior
treatment of S8-D, R-3 is gated on:

1. Explicit user authorisation of the forward-only
   `meeting_links.recording_url` migration (S8-D's dropped
   item).
2. Explicit user authorisation of the `ZOOM_WEBHOOK_SECRET`
   `.env.example` rotation.
3. Explicit user decision on the "n8n owns the write" vs
   "Next.js owns the write" architecture for the
   `recording.completed` event.

If the user prefers to keep Sprint 10 I-1-only and defer R-3
to a Sprint 11 (S8-D-style, read-only or full), that is a
valid scope decision and the user should approve the
I-1-only scope.

---

## E. Database impact

### E.1 I-1 (n8n workflow authoring)

- **No new migrations.** The v2 schema is already in place
  (Sprint 3.5). The I-1 work is purely n8n JSON + Next.js
  route handlers.
- **No new RLS policies.** The existing
  `session_bookings_select_owner_admin` /
  `session_bookings_student_update_cancel` /
  `meeting_links_select_via_session_booking` /
  `payments_select_via_session_grant` policies are sufficient
  for the new routes.
- **No new triggers, no new indexes.** The existing
  `uq_meeting_links_session_booking_id` partial UNIQUE is
  what guarantees one meeting per session booking (the
  `webhooks/n8n/route.ts` `meeting_created` case uses
  `upsert(..., { onConflict: 'session_booking_id' })`).

### E.2 R-3 (recording write-back)

- **1 new migration** (forward-only):
  - `ALTER TABLE public.meeting_links
       ADD COLUMN IF NOT EXISTS recording_url text;`
  - `ALTER TABLE public.meeting_links
       ADD COLUMN IF NOT EXISTS recording_completed_at
       timestamptz;` (optional — useful for the
     "Recording not available yet" sentinel and for the
     "Recording available since X" UI label; the user must
     approve the extra column).
  - 1 new `zoom_dead_letters` table or a documented choice
     to reuse the existing observability tables.
- **No new RLS policies** (RLS already covers
  `meeting_links`).
- **1 new env var** (`ZOOM_WEBHOOK_SECRET`) — requires
  `.env.example` rotation.

### E.3 I-1 + R-3 combined

The two combined = 1 forward-only migration
(`meeting_links.recording_url` + optional
`recording_completed_at`) + 1 `.env.example` rotation
(`ZOOM_WEBHOOK_SECRET`).

---

## F. External integrations

### F.1 What Sprint 10 I-1 touches (no new SaaS)

The I-1 work does **not** introduce any new SaaS. The
existing four (Calendly, Stripe, Zoom, Resend) are all
already in `lib/env.ts`. n8n is already in
`n8n/credentials/`. The I-1 work is:

- Rewrite the 8 v1-shaped inactive n8n workflow JSONs to
  v2-shaped JSONs.
- Add 1 Next.js route `POST /api/enrollments/by-calendly-invitee`
  (resolves the booking context).
- Add 1 Next.js route `POST /api/n8n/notify` (renders the
  email templates for `module_booking_confirmed`,
  `admin_dead_letter`, `email_tutor`).
- Update the Calendly forwarder's body if needed (the
  current body is `{ type: 'invitee.created', event_id, payload }`
  which matches the workflow's expected shape; verify
  during implementation).

### F.2 What Sprint 10 R-3 touches

- 1 Zoom inbound webhook registration (this IS a Zoom
  configuration change — must be done in the Zoom
  marketplace UI for a Zoom S2S OAuth app).
- 1 new env var `ZOOM_WEBHOOK_SECRET`.
- 1 new n8n workflow.
- 1 new Next.js inbound route.
- 1 new `.env.example` key.

### F.3 No new SaaS, no new credentials provider

Sprint 10 (either scope) does not introduce Upstash,
Sentry, Calendly v2, Stripe Connect, a second Zoom account,
a new email provider, or any other SaaS. The pre-flight
guardrails are honoured.

---

## G. Environment / secrets

### G.1 Existing env (unchanged by I-1)

`lib/env.ts` already declares every var the I-1 work
needs:

- `N8N_ENROLLMENT_WEBHOOK_URL` (forwarding target).
- `N8N_WEBHOOK_SECRET` (shared secret in
  `x-webhook-secret` header).
- `NEXT_PUBLIC_SITE_URL` (used as the
  `{{ $env.NEXT_PUBLIC_SITE_URL }}` base for n8n
  HttpRequest nodes).
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`,
  `ZOOM_ACCOUNT_ID`, `ZOOM_DEFAULT_HOST_USER_ID`,
  `CALENDLY_PERSONAL_TOKEN`, `CALENDLY_WEBHOOK_SIGNING_KEY`,
  `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — all read by n8n
  workflows via `$env.*`, never read by the Next.js booking
  path (per ADR-003).

### G.2 R-3 prerequisite (must be authorised)

- New server env var `ZOOM_WEBHOOK_SECRET` — required for
  the Zoom inbound webhook signature verification.
- New `.env.example` entry `ZOOM_WEBHOOK_SECRET=""`
  (empty in dev so `pnpm build` still passes; the
  validation in `lib/env.ts` marks it `.optional()`).
- 1 new Vercel env (per environment: production, staging,
  preview) when the user is ready to ship R-3.

### G.3 What the user must provision

If R-3 is in-scope, the user must:

1. Generate a Zoom webhook secret in the Zoom marketplace UI.
2. Add it to Vercel env (production, staging).
3. Update the operator's `.env.local` (not committed).

Per the pre-flight guardrail, this audit does **not** edit
`.env.local`, `.env.example`, or any env file. The
provisioning checklist is reported, not actioned.

---

## H. Security

### H.1 Existing security posture (unchanged by I-1)

- All four inbound webhooks verify a signature
  (Stripe `stripe-signature`, Calendly
  `Calendly-Webhook-Signature`, n8n `x-webhook-secret`,
  Zoom `x-zm-signature` [R-3 only]).
- The service-role key is restricted to
  `app/api/webhooks/**` and `app/api/auth/register/**`
  (per CLAUDE.md §2.3).
- Every public table is RLS-protected; admin powers go
  through `public.is_admin()` /
  `public.is_super_admin()`.
- n8n is the ONLY system that calls Stripe / Zoom /
  Calendly on the booking path (ADR-003). The Next.js app
  holds no Zoom secret and no service-role key for booking
  mutations.
- Idempotency at every external boundary
  (ADR-016): `webhook_events(event_id) UNIQUE`,
  `meeting_links.booking_id UNIQUE`,
  Stripe `idempotency_key`,
  `notifications(user_id, type, payload->>'booking_id',
  channel) UNIQUE`.

### H.2 R-3 security additions

- Zoom S2S OAuth credentials are read ONLY by n8n (the
  Zoom marketplace webhook delivery is signed with a
  separate secret).
- The new `x-zm-signature` verification uses
  `crypto.timingSafeEqual()` (same pattern as the existing
  Calendly route).
- The new `webhook_events` row keyed on
  `(provider='zoom', event_id)` guarantees
  one delivery per Zoom event.
- The `meeting_links.recording_url` write is scoped to the
  `meeting_links` row that matches the Zoom meeting id
  (the join key). A spoofed `recording.completed` with a
  random Zoom meeting id will not match any row and the
  `update` will affect 0 rows — this is the
  defence-in-depth against a forged `x-zm-signature`
  (which is itself prevented by HMAC verification).

### H.3 Pre-flight security checks (audit, not implementation)

- Verify the new `app/api/n8n/notify` route does NOT accept
  arbitrary email addresses (the v1 `admin_dead_letter`
  template addresses must be hard-coded or come from a
  closed-set enum, never from the request body).
- Verify the new `app/api/enrollments/by-calendly-invitee`
  route enforces the booking's student_id ==
  `auth.uid()` (or `public.is_admin()`) before resolving
  the booking.
- Verify the new Zoom route does not return the recording
  URL in the response body (it should 200 with `{ ok: true
  }` and not echo the URL — same pattern as the existing
  Stripe and Calendly webhooks).

---

## I. Test plan (gap analysis)

### I.1 Existing tests in scope

- `reminders-cron-route.test.ts` — Sprint 5 Slice E
  auth-only test. Covers the `x-webhook-secret` check and
  the env-var-missing guard.
- `reminders-service.test.ts` — Sprint 5 Slice E
  hermetic test of `runReminderWindow`.
- `session-bookings-route.test.ts` — Sprint 3.5 smoke
  test.
- `admin-session-bookings-manual-complete.test.ts` — Sprint 8
  B-19.

### I.2 Test gaps that Sprint 10 must close

- **No tests for `webhooks/stripe/route.ts`.** The
  signature verification, the `webhook_events` dedup, the
  v2 `session_grant_id` routing, and the `markSessionGrantPaid`
  call are un-tested. A mock-Stripe fixture
  (similar to the existing Calendly HMAC test in
  `tests/unit/calendly-webhook-validation.test.ts` if it
  exists) is needed. **Audit note: this gap pre-dates
  Sprint 10 and is not a Sprint 10 blocker, but Sprint 10
  should close it as a side-effect of the I-1 work
  (adding test coverage to the booking path's webhooks
  is on-scope as a quality gate).**
- **No tests for `webhooks/calendly/route.ts`.** Same
  story. The signature verification and the n8n
  fire-and-forget forwarder are un-tested.
- **No tests for `webhooks/n8n/route.ts`.** The 10
  `case` branches are un-tested. The
  `reminder_dispatch` / `meeting_created` /
  `session_booking_cancelled` branches are the
  highest-priority targets (they are the ones the I-1
  v2 workflows will exercise).
- **No tests for any of the 8 v1/v2 n8n workflow
  JSONs.** n8n workflow JSONs are typically validated by
  importing them into a dev n8n instance and exercising
  the workflow; this is an integration test, not a
  Vitest unit test. The audit recommends a
  `tests/integration/n8n-workflows.test.ts` (or
  equivalent) that imports each JSON into a dockerised
  n8n and POSTs a fixture body to the webhook. The
  audit leaves the exact test runner choice to the
  implementation sprint, but **the I-1 work is not
  complete without at least one end-to-end test of
  each of the 8 workflows**.
- **No tests for the new `POST /api/n8n/notify` route
  (R-1 / R-2 / R-3).** The route is new; it must ship
  with Zod-validation tests (similar to the existing
  `admin-resources-validation.test.ts`).
- **No tests for the new `POST
  /api/enrollments/by-calendly-invitee` route.** The
  route is new; it must ship with happy-path +
  404 + 401 tests.
- **No tests for the new `POST /api/webhooks/zoom/`
  route (R-3).** The route is new; it must ship with
  signature-verification, dedup, and write-back tests.

### I.3 What the I-1 work must add

- At minimum: route-level tests for the 3 existing
  webhooks (Stripe, Calendly, n8n) + the 2 new routes
  (`/api/n8n/notify`, `/api/enrollments/by-calendly-invitee`).
- A workflow-level smoke test (one per v2 workflow JSON)
  that POSTs a fixture body to the n8n webhook path and
  asserts the Supabase write-back.
- Updated `n8n/docs/WORKFLOWS.md` §2 to reflect the v2
  field renames (the doc is already v2-aware in §2.2, §2.3,
  §2.10; the implementation must not regress the doc to v1).

### I.4 What R-3 must add (if in scope)

- Signature-verification tests for the Zoom webhook
  (valid sig → 200, invalid sig → 401, missing sig → 401,
  replay → 200 + duplicate).
- Write-back tests for `recording.completed` (matching
  meeting id → row updated; non-matching meeting id → 0
  rows affected; replay → duplicate).
- `meeting.ended` → `session_bookings.status =
  'completed'` test.
- `.env.example` rotation test (the existing
  `env-validation.test.ts` if it exists, or a new one,
  must cover the new `ZOOM_WEBHOOK_SECRET` key).

---

## J. File-level implementation plan (subject to user approval)

### J.1 Sprint 10 I-1 (n8n + 2 Next.js routes)

**Modified files (n8n JSONs — 8 files).**
- `n8n/workflows/enrollment-created.json` — rewrite to v2
  (use `session_grant_id`, emit `session_grant_checkout_created`,
  accept `course_id` not `course.slug`, etc.).
- `n8n/workflows/module-booking-to-zoom.json` — rewrite
  body field references from `module_booking_id` to
  `session_booking_id`. Output type is already v2
  (`meeting_created`).
- `n8n/workflows/module-completed.json` — rewrite to
  emit `session_completed` (v2 type) and use v2 field
  names. Add a new `case` for `meeting.ended` if not
  already covered (n8n owns the Zoom `meeting.ended`
  trigger; the workflow's `Webhook: module-completed`
  trigger is replaced by a n8n-internal trigger from the
  new `zoom-meeting-ended` workflow OR a direct Zoom
  webhook trigger). [Decision needed.]
- `n8n/workflows/module-confirmation-email.json` —
  rewrite to use v2 field names in the email body
  (`session_title` not `module_title`).
- `n8n/workflows/module-reminder-scheduler.json` —
  **DELETE** (superseded by `session-reminder-scheduler`).
  Or: keep as a no-op stub for backwards compat with
  the existing n8n dead-letter URL. [Decision needed.]
- `n8n/workflows/module-reschedule.json` — rewrite to
  emit `session_rescheduled` (v2 type) and use v2 field
  names.
- `n8n/workflows/module-cancellation.json` — rewrite to
  emit `session_cancelled` (v2 type), use v2 field
  names, and update the Zoom DELETE call to use
  `session_booking_id` (not `module_booking_id`).
- `n8n/workflows/admin-notification.json` — minor: add
  template branching for `admin_booking_confirmed`,
  `admin_booking_cancelled` (not just
  `admin_dead_letter`).
- `n8n/workflows/tutor-notification.json` — rewrite to
  call `/api/n8n/notify` with the v2 `email_tutor` type
  and v2 field names.

**Renames (decision needed).** The user-approved Sprint 3.5
plan said "no filename changes" — only the internal payload
field names. This audit honours that decision: keep the
filenames, update the internal payload. If the user
prefers the cleaner v2 names
(`session-booking-to-zoom.json`,
`session-completed.json`, etc.), the user must approve the
rename.

**New Next.js routes (2 files).**
- `apps/web/app/api/enrollments/by-calendly-invitee/route.ts` —
  POST. Resolves the `session_booking_id` from a
  `calendly_invitee_uri`. Zod-validated. Admin-only or
  `x-webhook-secret` (n8n is the only caller). Returns
  `{ session_booking_id, session_grant_id, student_id,
  tutor_id, session_id, scheduled_start, scheduled_end,
  timezone, module_title, student_name, duration_min,
  join_url }` for the n8n workflow to render the Zoom
  meeting and the confirmation email.
- `apps/web/app/api/n8n/notify/route.ts` — POST. Renders
  the email body from a Zod-validated payload
  (`type: 'email' | 'email_tutor'`, `template`, `to`,
  `locale`, `props`). Calls Resend directly
  (the only Next.js → vendor call besides
  `app/api/contact/route.ts`; this is consistent with
  CLAUDE.md §2.3 because the call is the renderer, not
  the orchestrator — n8n decides what to send, Next.js
  renders the HTML and hands it to Resend). The
  `admin_dead_letter` template hard-codes the
  `ADMIN_NOTIFY_EMAIL` env var (never reads `to` from
  the request body for the `admin_*` templates).

**Modified Next.js route (1 file).**
- `apps/web/app/api/webhooks/calendly/route.ts` — verify
  the forwarded body matches the v2 shape
  (`{ type: 'invitee.created', event_id, payload }`) and
  update the `x-webhook-secret` value if the n8n
  convention changes. (Currently the Calendly route
  forwards to `${N8N_ENROLLMENT_WEBHOOK_URL}/calendly`;
  the I-1 work may need to forward to
  `${N8N_ENROLLMENT_WEBHOOK_URL}/session-booking-to-zoom`
  to match the renamed workflow path. [Decision needed.])

**New files (tests).**
- `apps/web/tests/unit/n8n-webhook-route.test.ts` —
  covers the 10 `case` branches in
  `app/api/webhooks/n8n/route.ts`.
- `apps/web/tests/unit/calendly-webhook-route.test.ts` —
  covers the signature verification, dedup, and
  fire-and-forget n8n forwarder in
  `app/api/webhooks/calendly/route.ts`.
- `apps/web/tests/unit/stripe-webhook-route.test.ts` —
  covers the signature verification, dedup, and the
  v2 `session_grant_id` routing in
  `app/api/webhooks/stripe/route.ts`.
- `apps/web/tests/unit/n8n-notify-route.test.ts` —
  covers the new `/api/n8n/notify` route.
- `apps/web/tests/unit/by-calendly-invitee-route.test.ts` —
  covers the new `/api/enrollments/by-calendly-invitee`
  route.

**Modified docs (3 files).**
- `n8n/docs/WORKFLOWS.md` — update §7 Versioning
  ("The Sprint B2 JSON files are still Phase 1
  placeholders" is no longer true; rewrite). Update
  each `### 2.x` section to match the v2 payload.
  Update the diagram if the
  Calendly → Next.js forward path changes.
- `docs/BookingFlow.md` — update Part B (module
  booking → Zoom) to reflect the v2 payload, and add a
  Part D for the new `/api/n8n/notify` route.
- `docs/api/API.md` — document the 2 new routes.

**Modified PROJECT_STATE + CHANGELOG + sprint summary.**
- `docs/review/PHASE2_SPRINT_10_SUMMARY.md` (new).
- `PROJECT_STATE.md` — append the Sprint 10 block.
- `CHANGELOG.md` — add the `[1.10.0-phase2-sprint-10]`
  entry.

### J.2 Sprint 10 R-3 (recording write-back)

**New migration (1 file).**
- `supabase/migrations/<ts>_add_meeting_links_recording_url.sql`:
  - `ALTER TABLE public.meeting_links
       ADD COLUMN IF NOT EXISTS recording_url text;`
  - `ALTER TABLE public.meeting_links
       ADD COLUMN IF NOT EXISTS recording_completed_at
       timestamptz;` (optional; the user must decide).

**New Next.js route (1 file).**
- `apps/web/app/api/webhooks/zoom/route.ts` — POST.
  HMAC verification of `x-zm-signature`. Dedup via
  `webhook_events`. Handles `recording.completed`
  (write `recording_url` to the matching
  `meeting_links` row by `meeting_id`) and
  `meeting.ended` (flip `session_bookings.status` to
  `completed` via the joined `session_booking_id`).
  Zod-validated body.

**New n8n workflow (1 file).**
- `n8n/workflows/zoom-recording-completed.json` —
  triggered by Zoom's webhook delivery (or by a
  `meeting.ended` → n8n-internal chain). The exact
  trigger depends on the user's "n8n owns the write"
  vs "Next.js owns the write" decision.

**Modified env (1 file).**
- `.env.example` — add `ZOOM_WEBHOOK_SECRET=""`.

**Modified lib/env.ts.**
- Add `ZOOM_WEBHOOK_SECRET: z.string().min(1).optional()`
  to the server schema.

**New files (tests).**
- `apps/web/tests/unit/zoom-webhook-route.test.ts` —
  covers HMAC verification, dedup, `recording.completed`
  write-back, and `meeting.ended` state transition.
- `apps/web/tests/unit/env-validation.test.ts` (or
  update the existing one) — covers the new
  `ZOOM_WEBHOOK_SECRET` key.

**Modified docs.**
- `n8n/docs/WORKFLOWS.md` — add a §2.11
  `zoom-recording-completed`.
- `docs/api/API.md` — document the new route.
- `docs/BookingFlow.md` — add a Part E for the
  recording flow.
- `docs/database/Database.md` — document the new
  `meeting_links.recording_url` column.

**Modified PROJECT_STATE + CHANGELOG + sprint summary.**
- The same 3 files as J.1, but with the R-3 work
  included.

### J.3 I-1 + R-3 combined (proposed Sprint 10)

- 10 modified n8n JSONs (8 rewrites + 1 minor
  admin-notification + 1 rewrite for tutor-notification).
- 1 deletion (the deprecated `module-reminder-scheduler.json`).
- 1 new n8n JSON (`zoom-recording-completed.json`).
- 3 new Next.js routes
  (`/api/n8n/notify`,
  `/api/enrollments/by-calendly-invitee`,
  `/api/webhooks/zoom`).
- 1 modified Next.js route
  (`/api/webhooks/calendly`).
- 1 new migration
  (`add_meeting_links_recording_url`).
- 1 `.env.example` rotation
  (`ZOOM_WEBHOOK_SECRET`).
- 1 `lib/env.ts` addition.
- 5 new test files
  (n8n-webhook, calendly-webhook, stripe-webhook,
  n8n-notify, by-calendly-invitee, zoom-webhook).
- 3 modified docs
  (`n8n/docs/WORKFLOWS.md`, `docs/BookingFlow.md`,
  `docs/api/API.md`).
- 1 new doc (`docs/review/PHASE2_SPRINT_10_SUMMARY.md`).
- 2 modified doc bookkeeping files
  (`PROJECT_STATE.md`, `CHANGELOG.md`).

---

## K. Migration plan

### K.1 I-1 — no migration

The I-1 work is JSON + Next.js route + test work. No
migration is needed. The v2 schema is already in place.

### K.2 R-3 — one forward-only migration

`supabase/migrations/<ts>_add_meeting_links_recording_url.sql`:

```sql
-- =====================================================================
-- Migration: <ts>_add_meeting_links_recording_url.sql
-- Sprint:     10 (R-3)
--
-- Adds the `recording_url` (text, nullable) and
-- `recording_completed_at` (timestamptz, nullable) columns
-- to public.meeting_links. The columns are populated by
-- the Zoom recording.completed → n8n → Next.js write-back
-- pipeline (R-3). Both columns are nullable: a Zoom
-- meeting without a recording is a valid state.
--
-- No new RLS policies are required: the existing
-- `meeting_links_select_via_session_booking` policy
-- already covers the new columns.
--
-- No new indexes are required: the `meeting_id` lookup
-- in the Zoom route uses the existing
-- `meeting_links(meeting_id)` index added in
-- 20260707000004_bookings_payments.sql.
-- =====================================================================

ALTER TABLE public.meeting_links
    ADD COLUMN IF NOT EXISTS recording_url          text,
    ADD COLUMN IF NOT EXISTS recording_completed_at timestamptz;

COMMENT ON COLUMN public.meeting_links.recording_url IS
    'Zoom cloud recording share_url. Populated by the
     recording.completed n8n workflow (R-3). NULL until
     the host enables cloud recording AND the recording
     processing completes.';

COMMENT ON COLUMN public.meeting_links.recording_completed_at IS
    'Server time at which the recording.completed event
     was processed. Distinct from the Zoom-reported
     recording start_time (which lives in
     meeting_links.metadata).';
```

Per `CLAUDE.md §3.2`, the migration is forward-only. The
`IF NOT EXISTS` guards make it idempotent. The user must
authorise the migration before Sprint 10 implementation
begins (R-3 path).

### K.3 `meeting_links.recording_url` is the S8-D item

The migration is the same migration S8-D proposed in Sprint
8 (per `docs/review/PHASE2_SPRINT_8_SUMMARY.md §4`). The
audit recommends naming the file
`<ts>_add_meeting_links_recording_url.sql` to make the
intent obvious in `supabase/migrations/`.

---

## L. GA blockers

Per `docs/DevelopmentRoadmap.md` Phase 3 exit criteria and
the user's pre-flight scope ("GA-blocker sprint"), the GA
blockers Sprint 10 must close are:

1. **A runnable v2 booking path end-to-end.** A real
   student can browse a session, pay with Stripe, pick a
   Calendly slot, receive a Zoom link by email, attend
   the meeting, and have the session marked `completed`.
   This is the I-1 + R-3 combined scope.
2. **A runnable v2 recording pipeline.** A real recording
   of a real Zoom meeting lands in
   `meeting_links.recording_url` and is readable by the
   student on the session-detail page. This is the R-3
   read-path surface (S8-D's deferred UI work).
3. **A clean rollback story.** Every workflow is
   `active: false` in dev; the deploy script
   (`scripts/deploy-n8n.sh`) uses
   `n8n import:workflow --input=<file>` to install; the
   forward-only migrations are idempotent; the new routes
   are all behind `requireAdminRoute()` or
   `x-webhook-secret`.

### L.1 What Sprint 10 does NOT close (deferred)

- MFA (deferred per Sprint 8 reconciliation report §B).
- GDPR data-export (deferred per Sprint 8 reconciliation
  report §B).
- Playwright suite (deferred per Sprint 8 reconciliation
  report §B).
- Vitest coverage project (deferred per Sprint 8
  reconciliation report §B).
- k6 load test (deferred per Sprint 8 reconciliation
  report §B).
- Upstash (Phase 5).
- Sentry (Phase 5).
- Email-templating refactor (the new
  `/api/n8n/notify` route renders emails with hand-rolled
  HTML in the route handler; the existing
  `lib/email/templates/*` React templates are NOT
  reused — this is consistent with the v1
  `session-reminder-scheduler.json` pattern but
  introduces a parallel email-rendering code path. A
  refactor to consolidate is a separate sprint.).

---

## M. Sprint 10 execution order (proposed, not yet approved)

The audit proposes the following execution order for the
Sprint 10 implementation (subject to user approval):

### M.1 Sub-sprint S10-A: I-1 v2 n8n workflow authoring (2-3 days)

1. Rewrite `enrollment-created.json` to v2.
2. Add `POST /api/n8n/notify` (the renderer) +
   Zod-validation tests.
3. Rewrite `module-booking-to-zoom.json` to v2 + add
   `POST /api/enrollments/by-calendly-invitee` (the
   resolver) + tests.
4. Rewrite `module-completed.json` to v2 (decide:
   trigger from n8n-internal chain or from a new
   `zoom-meeting-ended.json` workflow).
5. Rewrite `module-confirmation-email.json` to v2.
6. Rewrite `module-reschedule.json` to v2.
7. Rewrite `module-cancellation.json` to v2.
8. Rewrite `admin-notification.json` to v2.
9. Rewrite `tutor-notification.json` to v2.
10. Delete `module-reminder-scheduler.json` (or keep as
    a no-op stub — user decision).
11. Update `n8n/docs/WORKFLOWS.md` §2.x sections.
12. Add the route-level tests for `webhooks/stripe`,
    `webhooks/calendly`, `webhooks/n8n`.

### M.2 Sub-sprint S10-B: R-3 recording write-back (1-2 days, gated)

1. Authorise the
   `meeting_links_recording_url` migration.
2. Write the migration.
3. Add `ZOOM_WEBHOOK_SECRET` to `lib/env.ts` and
   `.env.example`.
4. Add `POST /api/webhooks/zoom/route.ts` + tests.
5. Add `n8n/workflows/zoom-recording-completed.json` +
   the `§2.11` doc section.
6. Register the Zoom webhook in the Zoom marketplace UI
   (operator action, not Claude action).
7. Update the read-path UI on
   `/dashboard/sessions/[id]` and the admin
   session-booking-detail page.

### M.3 Sprint close-out (½ day, both paths)

1. Run all 4 quality gates.
2. Write `docs/review/PHASE2_SPRINT_10_SUMMARY.md`.
3. Update `PROJECT_STATE.md` + `CHANGELOG.md`.
4. Stage, commit, push, tag
   `v1.10.0-phase2-sprint-10`.

### M.4 Calendar estimate

I-1 alone: 2-3 working days.
R-3 alone: 1-2 working days.
I-1 + R-3: 3-5 working days.

---

## N. Approval checklist

The user must approve each of the following before Sprint 10
implementation can begin. The audit does NOT pre-approve any
of these on the user's behalf.

- [ ] **N.1.** Confirm the proposed Sprint 10 scope:
      **I-1** (8 v2 n8n workflow JSONs + 2 new Next.js
      routes + 5 new test files + 1 modified route +
      modified docs) is in-scope.
- [ ] **N.2.** Confirm whether **R-3** (recording
      write-back) is in-scope for Sprint 10.
      - If **yes**: user must explicitly authorise the
        forward-only `meeting_links_recording_url` (+ the
        optional `recording_completed_at`) migration.
      - If **no**: defer R-3 to a Sprint 11 (S8-D-style
        read-only or full).
- [ ] **N.3.** If R-3 is in-scope, confirm the
      "n8n owns the write" vs "Next.js owns the write"
      architecture for the `recording.completed` event.
      - Option A: `Zoom → n8n workflow → POST
        /api/webhooks/zoom/route.ts → update
        meeting_links`. (Zoom marketplace webhook
        registered against the n8n instance.)
      - Option B: `Zoom → n8n workflow → POST
        /api/webhooks/n8n/route.ts → update
        meeting_links`. (Same n8n pipeline as the booking
        webhooks. Simpler.)
- [ ] **N.4.** Confirm the n8n workflow filename policy:
      keep v1 filenames
      (`module-booking-to-zoom.json`, etc.) with v2
      internal payload, OR rename to v2 filenames
      (`session-booking-to-zoom.json`,
      `session-completed.json`, etc.).
- [ ] **N.5.** Confirm the deprecated
      `module-reminder-scheduler.json` policy: delete OR
      keep as a no-op stub.
- [ ] **N.6.** Confirm the new `/api/n8n/notify` route
      is acceptable: Next.js renders the email body and
      hands it to Resend, n8n is the orchestrator (not
      the renderer). This is the v1 pattern repeated for
      non-reminder emails; if the user prefers n8n to
      render the email body itself, the route is not
      needed and the v1 workflow pattern must be
      extended.
- [ ] **N.7.** Confirm the `.env.example` rotation
      (`ZOOM_WEBHOOK_SECRET=""`) is acceptable for R-3.
- [ ] **N.8.** Confirm the tag name:
      `v1.10.0-phase2-sprint-10` (matches the
      `v<x.y.z>-phase<n>-sprint<m>` convention).
- [ ] **N.9.** Confirm that Sprint 10's "Quality gates
      pass + tag + push" cadence matches the user's
      expectations (same as Sprints 8 and 9).
- [ ] **N.10.** Confirm the 54 untracked scratch files
      in the working tree are NOT to be cleaned by this
      sprint (per Sprint 9 close-out guidance and the
      pre-flight guardrail).

The audit does **not** proceed to implementation until the
user explicitly approves the scope. The user may
authorise the full proposed scope, a subset, or none of
it.

---

## O. Recommendation

### O.1 Recommended Sprint 10 scope

**Recommend: I-1 only** (the 8 v2 n8n workflow JSONs +
the 2 new Next.js routes + the 5 new test files +
modified docs + modified `webhooks/calendly/route.ts`).

**Defer R-3 to Sprint 11** (with a separate
schema-change authorisation, separate `.env.example`
rotation, and its own sprint summary). Reasons:

1. R-3 requires a forward-only migration that the user
   has not yet authorised. Authorising a migration in
   the same sprint that introduces a lot of new code
   raises the blast radius if the migration fails.
2. R-3 is a separate "production wire" — it requires a
   Zoom marketplace webhook registration that the
   operator must perform manually. Mixing it with the
   I-1 work means the operator's manual step is buried
   in a sprint that is mostly n8n-JSON work.
3. The I-1 work alone is GA-blocking. R-3 is a
   nice-to-have for the student UX (the recording
   surface) but is not in the Phase 3 exit criteria
   in `docs/DevelopmentRoadmap.md` ("students can
   browse a course, pick a slot, pay, and receive a
   Zoom link by email"). The recording surface is
   called out in `docs/BookingFlow.md` Part E but is
   not in the Phase 3 milestones M3.1-M3.4.

### O.2 If the user prefers I-1 + R-3 combined

Then the user must:

1. Authorise the
   `meeting_links_recording_url` migration in this same
   sprint (per the pre-flight guardrail "modifying
   migrations requires explicit user authorisation").
2. Authorise the `.env.example` rotation
   (`ZOOM_WEBHOOK_SECRET`).
3. Choose the "n8n owns the write" vs "Next.js owns
   the write" architecture (N.3 above).
4. Provision the Zoom webhook in the Zoom marketplace UI
   (operator action, post-implementation).

### O.3 Either way, the audit recommends

- The I-1 work must include the route-level tests for
  the 3 existing webhooks (Stripe, Calendly, n8n). They
  are un-tested today and the I-1 work touches the
  Calendly forwarder's body — without tests, the I-1
  work risks regressing the live path.
- The deprecated `module-reminder-scheduler.json` is
  recommended for **deletion** (cleaner) over keeping as
  a stub. The user can override.
- The new `/api/n8n/notify` route should hard-code the
  `admin_*` template `to` address from
  `ADMIN_NOTIFY_EMAIL` env var (never read from the
  request body) — this is a security check, not a
  feature decision.

---

*Last updated: 2026-09-12. Owner: project lead. This is a
read-only audit document. No source file, migration,
env file, or tag is modified by writing this document.*

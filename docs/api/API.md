# API

> All HTTP routes are App Router **route handlers** under
> `apps/web/app/api/**/route.ts`. They all return JSON.

> **Sprint B2 change — module-based workflow.** The booking API
> is now two-tier: `/api/enrollments` (pay-once-per-course) and
> `/api/module-bookings` (per-live-session). The legacy
> `/api/bookings/*` endpoints are **deprecated** and return
> `410 Gone` with a `code: 'endpoint_removed'` and a link to the
> new endpoint. See §3 for details.

## 1. Conventions

- Base path: `/api`
- Versioning: none in Phase 1; if/when needed, prefix with `/api/v1`.
- Auth: every route that is not explicitly public checks
  `getCurrentUser()` and returns `401` if missing.
- Validation: every body is parsed with **Zod** (`lib/validations/*`).
- Errors: centralised in `lib/utils/api.ts#errorResponse`; clients
  receive `{ error: { code, message, details } }` with a typed status.
- **Source of truth for scheduled time is Calendly.** The
  module-booking endpoints never accept `start` / `end` from the
  client; the client picks a module, and the Calendly webhook
  fills the time.

## 2. Endpoints

### 2.1 Auth

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| `POST`   | `/api/auth/register`            | public  | `{ fullName, email, password, acceptTerms }` | Create a user with the admin client |
| `PUT`    | `/api/auth/register`            | public  | `{ email }`                                   | Trigger password-reset email |
| `POST`   | `/api/auth`                     | public  | `{ email, password }`                         | Sign in (sets cookies) |
| `DELETE` | `/api/auth`                     | user    | `{ scope? }`                                  | Sign out (default global) |
| `GET`    | `/api/auth/callback?code=…&next=…` | public | — | OAuth / magic-link / recovery callback |

### 2.2 Profile

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| `GET`   | `/api/profile`  | user | — | Current profile |
| `PATCH` | `/api/profile`  | user | `{ full_name?, phone?, timezone?, locale?, avatar_url? }` | Update mutable fields |

### 2.3 Courses

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/courses`        | public | List published courses, with filters `subject`, `level_group`, `q`, `page`, `pageSize` |
| `GET` | `/api/courses/[slug]` | public | Single course with tutors and a **module list** |

### 2.4 Tutors

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/tutors` | public | List published tutors (with profile) |

### 2.5 Enrollments  *(NEW in Sprint B2)*

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| `GET`  | `/api/enrollments`                | user  | — | Current user's enrollments (with course + progress) |
| `POST` | `/api/enrollments`                | user  | `{ courseId }` | Create an `enrollments` row in `pending_payment` and a Stripe Checkout Session; returns `{ url, sessionId, enrollmentId }` |
| `GET`  | `/api/enrollments/[id]/modules`   | user  | — | List the modules of the course with this user's `module_progress` joined. `404` if the enrollment does not belong to the user. |

### 2.5.1 Subscriptions  *(NEW in TASK 3 / Feature C — Monthly Support)*

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| `POST` | `/api/subscriptions`             | user  | `{ kind: 'monthly' }` | Provision the Monthly Support subscription row (status=`incomplete`) + first-period pool grant + first `subscription_period_grants` row (PRIMARY KEY race-safety), then call n8n to create a Stripe Checkout Session in `mode=subscription`. Returns `{ subscription_id, checkout_url, stripe_session_id, kind: 'monthly' }`. **Mock-gated**: when `N8N_ENROLLMENT_WEBHOOK_URL` is unset → 503 `checkout_unavailable`. On n8n non-OK → 502 `checkout_provider_error`. On duplicate subscription → 409 `monthly_subscription_exists`. |
| `GET`  | `/api/student/subscription`      | user  | — | Returns the student's current Monthly Support subscription row + the current period's `subscription_period_grants` row + `cancel_at_period_end` + `period_end` + `next_refresh_at`. RLS-respecting. Returns `{ subscription: null, ... }` when no subscription. |
| `DELETE` | `/api/student/subscription`    | user  | — | Student-initiated cancel-at-period-end (D-2). Sets `cancel_at_period_end=true`. Returns `{ cancel_at_period_end: true, period_end }`. No immediate state change; the period-refresh path at `current_period_end` finalises the cancellation. 409 `subscription_already_cancelling` if already cancelling. |

### 2.5.2 Stripe subscription lifecycle (delegates from `/api/webhooks/stripe`)

The webhook route (Sprint B2) now handles four additional event
types that drive the Monthly Support state machine. The
delegations live in `apps/web/lib/stripe/subscription-event-handlers.ts`.

| Event | Handler | Effect |
|---|---|---|
| `customer.subscription.created` | `handleCustomerSubscriptionEvent` (no existing row branch) | `provisionMonthlySubscription` — creates `subscriptions` + `session_grants` pool + `subscription_period_grants` atomically. |
| `customer.subscription.updated` (new `current_period_start`) | `handleCustomerSubscriptionEvent` (existing + period changed branch) | `refreshSubscriptionPeriod` — creates a new `subscription_period_grants` row + new pool. Race-safe via PK on `(subscription_id, period_start)`. |
| `customer.subscription.updated` (status `past_due`) | `handleCustomerSubscriptionEvent` (past_due branch) | `markSubscriptionPastDue` — stamps `past_due_at`, `grace_period_ends_at = now + 5 days`, sends the `monthly_payment_failed` email. **D-1**: does NOT mutate the `session_grants` pool. |
| `customer.subscription.updated` (status `active` recovered from `past_due`) | `handleCustomerSubscriptionEvent` (recovery branch) | `markSubscriptionPaymentRecovered` — clears `past_due_at` + `grace_period_ends_at`, sends the `monthly_payment_recovered` email. |
| `customer.subscription.deleted` | `handleCustomerSubscriptionDeleted` | `markSubscriptionSuspended` (reason=`stripe_deleted`) — flips status=`cancelled`, stamps `suspended_at` + `cancelled_at`, sends the `monthly_suspended` email. |
| `invoice.payment_failed` (when `inv.subscription` is set) | `handleInvoicePaymentFailed` | `markSubscriptionPastDue` — same as the `customer.subscription.updated` past_due branch. |

### 2.5.3 Free Trial  *(NEW in Phase 1 — Feature A — First free 60-minute session)*

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| `POST` | `/api/free-trial`              | user  | `{ session_id: uuid }` | Claim the student's one-time free 60-minute trial on a published session. Student identity is taken from the authenticated session — NEVER from the body. Calls `startFreeTrialSessionGrant` (which is gated by `uq_session_grants_one_trial_per_student` for race-safety), looks up the seeded `COURSENLIGNE_FREE_TRIAL` coupon (100% off, EUR), and POSTs a trial-shaped payload (`kind: 'trial'`, `coupon_id`, `amount_cents: 0`, `success_url`, `cancel_url`, `locale`) to n8n to mint a Stripe Checkout Session. Returns `201 { ok: true, data: { session_grant_id, checkout_url, kind: 'trial' } }`. **Mock-gated**: when `N8N_ENROLLMENT_WEBHOOK_URL` is unset → 503 `checkout_unavailable`. Status mapping: `404 session_not_found` / `422 session_price_missing` / `409 free_trial_already_used` (with `details.grant_id`) / `503 coupon_unavailable` / `502 checkout_provider_error`. |
| `GET`  | `/api/free-trial`              | user  | — | Returns the student's free-trial eligibility read for the dashboard banner: `{ ok: true, data: { used: boolean, grant_id: string \| null, status: 'pending_payment' \| 'active' \| 'completed' \| null } }`. RLS-respecting. `used=true` when the student has a counting trial grant (`pending_payment`, `active`, or `completed`). `401` when no user is signed in. |

The endpoint is gated by the partial unique index
`uq_session_grants_one_trial_per_student` on
`public.session_grants(student_id) WHERE is_trial = true AND
status IN ('pending_payment', 'active', 'completed')`. Two
parallel trial claims for the same student resolve to exactly
one `session_grants` row (Postgres SQLSTATE 23505 → service
maps to 409 `free_trial_already_used`). See `Database.md §12.4`.

### 2.5.4 Admin Pack 10 grants + €35/unused-session refund  *(NEW in Phase 2 — Feature B)*

The admin back-office surface for Pack 10 (€299, 10 × 60-min
sessions, 6-month validity). All four routes are gated by
`requireAdminRoute()` (401 anonymous, 403 non-admin). The
service layer is `apps/web/services/admin/pack-grants.ts`.
The DB-layer invariants are documented in `Database.md §12.5`.

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| `GET` | `/api/admin/pack-grants` | admin | — | List Pack 10 grants (filter `grant_type='pack'`, order `created_at desc`, limit 200). Joins `student:profiles!session_grants_student_id_fkey` for student name/email. RLS-respecting — non-admins receive `403`. Returns `{ ok: true, data: AdminPackGrant[] }`. |
| `GET` | `/api/admin/pack-grants/[id]` | admin | — | Single Pack grant by id. RLS-respecting. Returns `{ ok: true, data: AdminPackGrant }`. `404` when the row does not exist (or RLS denies). |
| `GET` | `/api/admin/pack-grants/[id]/refund-preview` | admin | — | Compute the refund preview WITHOUT mutating the row. Returns `{ ok: true, data: { preview: PackRefundPreview } }` where `preview.kind` is one of `ok` (with `unusedSessions`, `calculatedCents`, `actualCents`, `capped`), `already_refunded`, or `invalid_state` (with `currentStatus`). `404` when the row does not exist. |
| `POST` | `/api/admin/pack-grants/[id]/refund` | admin | — (empty) | Initiate the Pack refund. See §2.5.4.1 for the full state machine and HTTP shape. |

The list row shape (`AdminPackGrant`) is the flattened join
of `session_grants` + `profiles`:

```ts
type AdminPackGrant = {
  id: string;                       // session_grants.id
  studentId: string;                // profiles.id
  studentName: string | null;       // profiles.full_name
  studentEmail: string | null;      // profiles.email
  status: 'pending_payment' | 'active' | 'completed' | 'cancelled' | 'refunded';
  amountCents: number;              // integer cents (€29900)
  currency: 'EUR';
  totalCredits: number;             // 10 (PACK_TOTAL_CREDITS)
  consumedCredits: number;          // 0..10
  refundedAt: string | null;        // ISO 8601 or null
  refundedAmountCents: number;      // 0..amountCents
  createdAt: string;                // ISO 8601
  expiresAt: string;                // ISO 8601 (purchase + 6 months)
};
```

#### 2.5.4.1 `POST /api/admin/pack-grants/[id]/refund` — state machine

The admin refund route NEVER writes `session_grants.status` or
`session_grants.refunded_amount_cents`. Those columns are
flipped SOLELY by the `fn_enrollments_refund` cascade
trigger on Stripe's `charge.refunded` webhook
(`Database.md §12.5.3`). The admin route is an **outbox
enqueuer only** — it records the outbound attempt in
`n8n_executions` (with `run_id = refund_request_id`,
UNIQUE = at-most-once primitive) and POSTs to
`N8N_ENROLLMENT_WEBHOOK_URL`.

The service (`executePackRefund`) returns a discriminated
union:

```ts
type ExecutePackRefundResult =
  | { kind: 'ok'; refundRequestId: string;
      requestedAmountCents: number; currency: 'EUR' }
  | { kind: 'not_found' }
  | { kind: 'invalid_state'; currentStatus: string }
  | { kind: 'already_refunded' }
  | { kind: 'refund_zero'; unusedSessions: number }
  | { kind: 'webhook_failed'; reason: string;
      refundRequestId: string }
  | { kind: 'webhook_unavailable'; reason: 'not_configured';
      refundRequestId: string };
```

HTTP status mapping (verbatim from the route):

| Service `kind` | HTTP | Body `error.code` | Notes |
|---|---|---|---|
| `ok` | 200 | — | `refund_status: 'n8n_accepted'` (n8n returned 2xx). Body does NOT claim Stripe confirmation. |
| `not_found` | 404 | — | Pack grant id does not exist. |
| `invalid_state` | 409 | `pack_refund_invalid_state` | `currentStatus` ∈ `cancelled`. |
| `already_refunded` | 409 | `pack_refund_already_refunded` | Also fires on the SQLSTATE 23505 / 23514 race (outbox UNIQUE / DB CHECK). |
| `refund_zero` | 422 | `pack_refund_zero` | `unused_sessions: 0` — all 10 sessions consumed. |
| `webhook_failed` | 502 | `pack_refund_webhook_failed` | n8n returned 5xx or the fetch threw. The outbox row is `status='failed'`; operator may retry. |
| `webhook_unavailable` | 503 | `pack_refund_webhook_unavailable` | `N8N_ENROLLMENT_WEBHOOK_URL` unset. The outbox row is `status='started'`; operator must configure or drain. |

**200 response body** (the only success shape):

```jsonc
{
  "ok": true,
  "data": {
    "refund_request_id": "<grantId>:<ISO timestamp>",
    "requested_amount_cents": 17500,            // 5 unused × €35
    "currency": "EUR",
    "refund_status": "n8n_accepted",             // NOT "stripe_confirmed"
    "grant": { /* AdminPackGrant, re-read */ }
  }
}
```

**Why `refund_status='n8n_accepted'` (not `'stripe_confirmed'`).**
The admin route cannot know whether Stripe has confirmed the
refund at HTTP-response time. Stripe confirmation is observed
asynchronously via the `charge.refunded` webhook →
`payments.status='refunded'` → `fn_enrollments_refund`
cascade, which flips `session_grants.status='refunded'` and
writes `refunded_amount_cents`. Until that webhook fires, the
DB row remains `active` (or `completed`). The admin UI can
poll / re-read `payments.status='refunded'` for the linked
payment row to surface the Stripe-confirmed state.

**Why the route does NOT write `session_grants.status='refunded'`.**
The user-stated invariant is that the DB row's
`status='refunded'` and `refunded_amount_cents` MUST NOT be
written by the admin route — those writes are owned by the
Stripe cascade. Before the application claims "the refund is
done", it must wait for the Stripe webhook. Until then, the
admin UI shows `refund_status='n8n_accepted'` (not "refunded")
and the DB row continues to display `status='active'` /
`'completed'` depending on where in the cascade the
operation currently sits.

#### 2.5.4.2 Race-safety

Two admins clicking Refund simultaneously produce exactly one
outbox row. The second's INSERT into `n8n_executions` hits
`UNIQUE (run_id)` and Postgres returns SQLSTATE `23505`.
The service maps `23505` → `kind: 'already_refunded'` → 409
`pack_refund_already_refunded`. The Stripe-side race
(Stripe receives the refund request twice for the same
`payment_intent`) is handled by Stripe's own
`idempotency_key` mechanism + the cascade's `WHERE` filter,
both pre-existing.

#### 2.5.4.3 Why `n8n_executions` is the outbox (not `webhook_events`)

`webhook_events.processed=true` carries the documented
semantic "this inbound provider event has been applied to DB
state" (used by both the Stripe and n8n inbound routes).
Reusing `processed=true` for an outbound enqueue would
corrupt that semantic. The correct outbox primitive is
`n8n_executions.run_id UNIQUE`. See `Database.md §12.5.4`.

### 2.6 Module bookings  *(NEW in Sprint B2)*

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| `GET`  | `/api/module-bookings`             | user | — | Current user's module bookings (with module + meeting) |
| `POST` | `/api/module-bookings`             | user | `{ moduleId }` | **Create a `scheduled` `module_bookings` row** (no `start`/`end`; Calendly is the source of truth). The actual time is filled by the Calendly `invitee.created` webhook. |
| `POST` | `/api/module-bookings/[id]/cancel` | user | `{ reason? }` | Cancel a module booking; fires n8n `module-cancellation` workflow. No refund (course-level only). |

**Why no `start`/`end` in the create body?** Calendly is the
single source of truth for scheduled time. The client picks a
module (which has a `calendly_event_uri`), the booking is
created in `scheduled` state with no time, and the Calendly
webhook fills `scheduled_start` / `scheduled_end` /
`calendly_event_uri` / `calendly_invitee_uri` when the student
picks a slot.

### 2.7 Bookings  *(DEPRECATED — return `410 Gone`)*

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`  | `/api/bookings`             | — | Returns `410 Gone` `{ code: 'endpoint_removed', message: '…', new_endpoint: '/api/module-bookings' }` |
| `POST` | `/api/bookings/checkout`    | — | Returns `410 Gone` with `new_endpoint: '/api/enrollments'` |
| `POST` | `/api/bookings/[id]/cancel` | — | Returns `410 Gone` with `new_endpoint: '/api/module-bookings/[id]/cancel'` |

The legacy `bookings` table is renamed to `_bookings_legacy`;
no new code reads it.

### 2.8 Resources

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/resources` | user | List the resources the current user can see (via `resource_grants` joined on the user's **enrollments**) |

### 2.9 Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`  | `/api/admin/overview`             | admin | KPIs: enrollments count, revenue, students, courses, module-bookings count |
| `POST` | `/api/admin/enrollments/[id]/refund` | admin | Refund a course-level enrollment; fires Stripe `refunds.create` against `enrollments.stripe_payment_intent_id` |
| `POST` | `/api/admin/modules`              | admin | Create a module (admin / super admin) |
| `PATCH` | `/api/admin/modules/[id]`        | admin | Edit a module |
| `DELETE` | `/api/admin/modules/[id]`       | super_admin | Delete a module (cascades to `module_bookings` and `module_progress`) |

### 2.10 Webhooks

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/webhooks/stripe`   | Stripe signature (`stripe-signature`) | Inbound from Stripe; idempotent via `webhook_events`. v2: handles `checkout.session.completed` (keys on `metadata.session_grant_id` and delegates to `markSessionGrantPaid`), `payment_intent.payment_failed`, `charge.refunded`. |
| `POST` | `/api/webhooks/calendly` | Calendly signature (`Calendly-Webhook-Signature`) | Inbound from Calendly (`invitee.created`, `invitee.updated`, `invitee.canceled`); idempotent. v2: forwards to `NEXT_PUBLIC_N8N_BOOKING_WEBHOOK` (fire-and-forget) which triggers the n8n `module-booking-to-zoom` workflow. |
| `POST` | `/api/webhooks/n8n`      | shared secret (`x-webhook-secret`) | Inbound from n8n. v2 event types: `meeting_created`, `session_grant_checkout_created`, `session_grant_refund_succeeded`, `session_booking_confirmed`, `session_booking_cancelled`, `session_booking_rescheduled`, `session_completed`, `payment_succeeded`, `payment_failed`, `reminder_dispatch`, `reminder_sent`, `workflow_failed`. The v1 event types `module_booking_*`, `module_completed`, `module_cancelled`, `module_rescheduled`, `enrollment_checkout_created`, `enrollment_refund_succeeded` were REMOVED in Sprint 3.6. |

### 2.10.1 n8n-internal routes (Sprint 10 I-1)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/n8n/notify`                  | shared secret (`x-webhook-secret`) | Email renderer. Discriminated union: `{ type: 'email', template: <TEMPLATE>, to?: <email>, locale: 'en'\|'fr', workflow?, props: { ... } }` or `{ type: 'email_tutor', to, subject, body, session_booking_id? }`. Templates: `session_booking_confirmed` / `session_booking_cancelled` / `session_booking_rescheduled` / `session_completed` / `session_grant_checkout_created` / `session_grant_payment_succeeded` / `session_grant_refund_succeeded` / `admin_dead_letter` / `admin_booking_confirmed` / `admin_booking_cancelled` / `admin_booking_rescheduled` (v1 aliases `module_*` / `enrollment_*` accepted for one release). The `admin_*` template set ignores the body's `to` and uses the hard-coded `ADMIN_NOTIFY_EMAIL` constant (`apps/web/lib/constants/index.ts`). Returns `200 { ok: true, skipped: 'resend_unset' \| 'resend_from_unset' }` when `RESEND_API_KEY` / `RESEND_FROM_EMAIL` is unset (replay-safe). |
| `POST` | `/api/enrollments/by-calendly-invitee` | shared secret (`x-webhook-secret`) | Booking-context resolver. Body: `{ calendly_invitee_uri, calendly_event_uri? }`. Returns the full `BookingContext`: `{ session_booking_id, session_id, session_grant_id, student_id, tutor_id, session_title, course_title, student_name, tutor_name, scheduled_start, scheduled_end, timezone, duration_min, join_url }`. The student's email is **NOT** included in the response. Defensive 409 when the supplied `calendly_event_uri` does not match the row's `calendly_event_uri`. |

### 2.11 Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | public | Liveness + readiness probe (DB, Stripe, Resend, n8n) |

## 3. Deprecated / removed endpoints

The following endpoints are **removed in name** but kept as
`410 Gone` so any stale link from production is caught and
redirected, not 404'd:

| Old endpoint | Returns | New endpoint |
|---|---|---|
| `GET  /api/bookings`             | `410 Gone` with `new_endpoint: '/api/module-bookings'` | `GET /api/module-bookings` |
| `POST /api/bookings/checkout`    | `410 Gone` with `new_endpoint: '/api/enrollments'`       | `POST /api/enrollments` |
| `POST /api/bookings/[id]/cancel` | `410 Gone` with `new_endpoint: '/api/module-bookings/[id]/cancel'` | `POST /api/module-bookings/[id]/cancel` |

The legacy `_bookings_legacy` table is renamed from `bookings`
in the same migration; no RLS is set on it, and no new code
reads it.

## 4. Error format

```json
{
  "error": {
    "code": "validation_error",
    "message": "Validation failed.",
    "details": { "fieldErrors": { "email": ["Invalid e-mail address."] } }
  }
}
```

| HTTP | code |
|------|------|
| 400  | `bad_request` |
| 401  | `unauthorized` |
| 403  | `forbidden` |
| 404  | `not_found` |
| 409  | `conflict` |
| 410  | `endpoint_removed` (new — see §3) |
| 422  | `validation_error` |
| 500  | `server_error` |

## 5. Rate limiting (Phase 5)

Up to Phase 5 the platform relies on Vercel + Supabase defaults. From
Phase 5 onwards a per-IP, per-route counter is added in the middleware
backed by Upstash Redis (key prefix `rl:<route>:<ip>`).

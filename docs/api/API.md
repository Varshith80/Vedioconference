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
| `POST` | `/api/webhooks/stripe`   | Stripe signature (`stripe-signature`) | Inbound from Stripe; idempotent via `webhook_events`. Handles `checkout.session.completed` (`metadata.enrollment_id`), `payment_intent.payment_failed`, `charge.refunded`. |
| `POST` | `/api/webhooks/calendly` | Calendly signature (`Calendly-Webhook-Signature`) | Inbound from Calendly (`invitee.created`, `invitee.updated`, `invitee.canceled`); idempotent |
| `POST` | `/api/webhooks/n8n`      | shared secret (`X-Webhook-Secret`) | Inbound from n8n: `module_booking_created`, `meeting_created`, `payment_succeeded`, `reminder_sent`, `workflow_failed` |

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

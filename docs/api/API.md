# API

> All HTTP routes are App Router **route handlers** under
> `apps/web/app/api/**/route.ts`. They all return JSON.

## Conventions

- Base path: `/api`
- Versioning: none in Phase 1; if/when needed, prefix with `/api/v1`.
- Auth: every route that is not explicitly public checks
  `getCurrentUser()` and returns `401` if missing.
- Validation: every body is parsed with **Zod** (`lib/validations/*`).
- Errors: centralised in `lib/utils/api.ts#errorResponse`; clients
  receive `{ error: { code, message, details } }` with a typed status.

## Endpoints

### Auth

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| `POST`   | `/api/auth/register`            | public  | `{ fullName, email, password, acceptTerms }` | Create a user with the admin client |
| `PUT`    | `/api/auth/register`            | public  | `{ email }`                                   | Trigger password-reset email |
| `POST`   | `/api/auth`                     | public  | `{ email, password }`                         | Sign in (sets cookies) |
| `DELETE` | `/api/auth`                     | user    | `{ scope? }`                                  | Sign out (default global) |
| `GET`    | `/api/auth/callback?code=…&next=…` | public | — | OAuth / magic-link / recovery callback |

### Profile

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| `GET`   | `/api/profile`  | user | — | Current profile |
| `PATCH` | `/api/profile`  | user | `{ full_name?, phone?, timezone?, locale?, avatar_url? }` | Update mutable fields |

### Courses

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/courses`        | public | List published courses, with filters `subject`, `level_group`, `q`, `page`, `pageSize` |
| `GET` | `/api/courses/[slug]` | public | Single course with tutors |

### Tutors

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/tutors` | public | List published tutors (with profile) |

### Bookings

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| `GET`  | `/api/bookings`             | user    | —                                          | Current user's bookings |
| `POST` | `/api/bookings/checkout`    | user    | `{ courseId, start, end }`                | Create a Stripe Checkout Session |
| `POST` | `/api/bookings/[id]/cancel` | user    | `{ reason? }`                              | Cancel a booking; triggers n8n cancellation workflow |

### Resources

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/resources` | user | List the resources the current user can see |

### Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/overview` | admin | KPIs: bookings count, revenue, students, courses |

### Webhooks

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/webhooks/stripe`   | Stripe signature (`stripe-signature`) | Inbound from Stripe; idempotent via `webhook_events` |
| `POST` | `/api/webhooks/calendly` | Calendly signature (`Calendly-Webhook-Signature`) | Inbound from Calendly; idempotent |
| `POST` | `/api/webhooks/n8n`      | shared secret (`X-Webhook-Secret`) | Inbound from n8n (meeting created, payment status, reminder sent) |

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | public | Liveness + readiness probe (DB, Stripe, Resend, n8n) |

## Error format

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
| 422  | `validation_error` |
| 500  | `server_error` |

## Rate limiting (Phase 5)

Up to Phase 5 the platform relies on Vercel + Supabase defaults. From
Phase 5 onwards a per-IP, per-route counter is added in the middleware
backed by Upstash Redis (key prefix `rl:<route>:<ip>`).

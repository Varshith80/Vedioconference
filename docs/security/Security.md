# Security

> The platform is designed to be safe by default. This document
> describes the controls that are in place from day one and the
> controls that land in later phases.

## 1. Authentication

- **Supabase Auth** (email + password, optional OAuth in Phase 4).
- Passwords: minimum 10 chars, lower + upper + digit, stored with
  bcrypt by Supabase.
- **Email verification** is mandatory before the user can hit any
  non-public route.
- **Password recovery** uses Supabase's built-in flow with a
  single-use, time-boxed token (1h by default).

## 2. Sessions

- JWT in an `httpOnly`, `Secure` (in production), `SameSite=Lax` cookie.
- Access token TTL: 1h. Refresh token TTL: 30 days, rotated on every
  refresh.
- Sessions are bound to the Supabase project (cannot be replayed
  against another project).

## 3. Authorization (Row Level Security)

- Every table has `enable row level security`.
- Policies are written so that the **default for an anonymous user
  is "no rows"**, then we open the public catalog explicitly.
- Admin powers go through the helper functions `public.is_admin()` and
  `public.is_super_admin()` — never by hard-coding role checks in
  policies.

## 4. Middleware

`apps/web/middleware.ts` runs on every request:

1. Refreshes the Supabase session cookie if needed.
2. Redirects unauthenticated traffic to `/dashboard/**` and `/admin/**`
   to `/auth/login?next=<path>`.
3. Adds `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: strict-origin-when-cross-origin`, and
   `Permissions-Policy` headers (camera/mic only for `self`).

## 5. Input validation

- Every public route handler validates the body with **Zod**
  (`lib/validations/*`).
- The centralised `errorResponse` translates `ZodError` into a 422
  with a flattened `fieldErrors` map so the client can show inline
  errors.

## 6. CSRF

- All write requests are POST/DELETE/PATCH.
- `SameSite=Lax` cookies mean cross-origin form submissions cannot
  attach the auth cookie.
- Mutating route handlers verify either:
  - the `Origin` / `Referer` header matches `NEXT_PUBLIC_SITE_URL`, **or**
  - an `Authorization: Bearer …` header is present (used by
    webhooks).

## 7. Rate limiting (Phase 5)

- Per-IP, per-route counters backed by Upstash Redis.
- Default: 60 requests / minute / IP.
- Authenticated routes: 600 requests / minute / user.
- Hard limit on `POST /api/auth/register` (10 / hour / IP) and
  `POST /api/auth` (5 / minute / IP).

## 8. Secrets

- All secrets live in Vercel + n8n credential store, never in the
  repository.
- Local development uses `.env.local`, which is `.gitignore`d.
- Service-role key is restricted by Supabase to the project URL and
  rotated every 90 days.

## 9. Storage

- `resources` bucket is private; downloads use signed URLs (TTL 1h).
- `avatars` and `course-covers` are public but the write policy
  restricts uploads to the owner (avatars) or admin (course-covers).

## 10. Audit log

- Every INSERT / UPDATE / DELETE on `bookings`, `payments` and
  `profiles` writes a row to `audit_logs` via the
  `fn_audit_changes()` trigger.
- The `audit_logs` table is admin-read-only.

## 11. Headers

| Header | Value | Why |
|---|---|---|
| `X-Frame-Options` | `DENY` | Clickjacking |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |
| `Permissions-Policy` | `camera=(self), microphone=(self), geolocation=()` | Limit device APIs |
| `Strict-Transport-Security` (in production) | `max-age=63072000; includeSubDomains; preload` | HTTPS only |
| `Content-Security-Policy` (Phase 5) | see below | XSS, framing, mixed content |

Phase 5 CSP:

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://js.stripe.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: https://images.unsplash.com https://*.supabase.co;
connect-src 'self' https://*.supabase.co https://api.stripe.com https://n8n.example.com;
frame-src https://js.stripe.com https://calendly.com https://*.zoom.us;
media-src 'self' https://*.zoom.us blob:;
font-src 'self' https://fonts.gstatic.com;
```

## 12. Dependency security

- `pnpm audit --prod` runs in CI on every PR.
- Renovate is configured (Phase 5) for weekly dependency updates with
  auto-merge of patch-level updates.
- `pnpm-lock.yaml` is committed and `--frozen-lockfile` is used in CI.

## 13. Reporting a vulnerability

Email `security@example.com`. We acknowledge within 48h and provide a
fix timeline within 7 days for confirmed issues.

# Phase 1 Review — Remediation Notes

> Generated automatically by the Phase 1 architecture review. This
> file documents **what changed and why**. The full review is in
> `docs/review/PHASE1_REVIEW.md`.

## Migrations added

- `20260707000008_subscriptions_billing.sql` — `subscriptions`,
  `coupons`, `invoices`, `webhook_events`, `n8n_executions`,
  `n8n_dead_letters` tables, plus the following triggers and
  policies:
  - `fn_no_tutor_overlap` — a tutor cannot have two overlapping
    `confirmed` bookings.
  - `fn_block_role_self_escalation` — a user cannot change their
    own `role` unless they are `super_admin`.
  - `fn_lock_tutor_profile_id` — `tutors.profile_id` is immutable
    after creation.
  - `fn_block_late_cancel` — a booking cannot be cancelled after
    the start time.
  - `uq_notifications_dedupe` — at most one row per
    `(user_id, type, booking_id, channel)`.
  - Tightened `course_tutors` write policy to admin-only.

## Routes added

- `POST /api/auth/register` (rewritten) — now forces
  `email_confirm: false`, resends the verification email, and
  returns the same `{ ok: true }` regardless of whether the user
  existed, with a `200ms` constant-time delay to mitigate
  enumeration.
- `PUT /api/auth/register` (rewritten) — same constant-time
  treatment.
- `POST /api/auth/verify-email` (new) — consumes the Supabase OTP.
- `POST /api/webhooks/stripe` (new) — verifies `stripe-signature`,
  dedupes via `webhook_events`, updates `payments` + `bookings`.
- `POST /api/webhooks/calendly` (new) — verifies the
  `Calendly-Webhook-Signature` header with constant-time compare.
- `GET /api/health` (new) — liveness + readiness probe.

## Routes updated

- `POST /api/bookings/[id]/cancel` — added the business rule
  (student can only cancel > 1h before start) and the
  `X-Request-Id` header pass-through.
- `POST /api/webhooks/n8n` — uses `webhook_events` for idempotency
  when the event carries an `event_id`; `meeting_links` upsert
  uses `onConflict: 'booking_id'`.

## Config

- `next.config.mjs` — added CSP, HSTS and a stricter
  `Permissions-Policy`.
- `.env.example` + `docs/deployment/Environment.md` — added
  `CALENDLY_WEBHOOK_SIGNING_KEY`.

## CI

- `.github/workflows/secret-scan.yml` (new) — gitleaks on every PR
  and push to `main`.

## Docs added

- `docs/ErrorHandling.md`
- `docs/Logging.md`
- `docs/Monitoring.md`
- `docs/DisasterRecovery.md`
- `docs/BookingFlow.md`
- `docs/TechnicalDebt.md`
- `docs/review/PHASE1_REVIEW.md`
- `docs/review/REMEDIATION.md` (this file)

## Docs updated

- `docs/architecture/ER_DIAGRAM.mmd` — added the 6 new tables and
  their relationships.
- `docs/architecture/Architecture.md` — references
  `n8n_dead_letters`.
- `docs/api/API.md` — added the new endpoints and the health route.

## Verification

After applying these changes the following must hold:

1. `pnpm type-check` passes (no broken imports from the new
   modules).
2. `pnpm lint` passes.
3. `supabase db reset` succeeds against a fresh local Postgres.
4. The RLS policies in migration 8 do not change the result of the
   smoke tests in `docs/review/SMOKETEST.md` (added in Phase 2).

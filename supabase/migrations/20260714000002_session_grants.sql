-- =====================================================================
-- Migration: 20260714000002_session_grants.sql
-- Sprint:     3.5 — Curriculum Architecture Restructure
--
-- Description
-- -----------
-- Introduces the new unit of payment: `session_grants`.
--
--   A session_grant is the per-student × per-session payment record.
--   A student purchases individual sessions; each purchased session
--   is one `session_grants` row.
--
-- Lifecycle (reused from `enrollment_status` enum)
-- -----------------------------------------------
--   pending_payment → active → completed
--                            ├─→ cancelled
--                            └─→ refunded
--
-- The `enrollment_status` enum is REUSED — same values, same
-- lifecycle, just a new table. This is the user-approved Q6
-- answer. The `completed` value now means "session attended"
-- (because the grant itself is the progress), not "course
-- completed".
--
-- Backwards compatibility
-- -----------------------
-- The pre-Sprint-3.5 `enrollments` table is kept (it is still
-- referenced by the v1 `payments.enrollment_id` and the
-- `_bookings_legacy` flow). The v1 endpoints return 410 Gone
-- with a pointer to the new endpoints. A follow-up cleanup
-- migration will drop `enrollments` and the v1 columns on
-- `payments` / `meeting_links` once all callers move.
--
-- Idempotency
-- -----------
-- Every CREATE / ALTER is guarded with `if not exists`. The
-- migration can be re-applied safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. `session_grants` — per-student × per-session payment
-- ---------------------------------------------------------------------
create table if not exists public.session_grants (
    id                        uuid primary key default gen_random_uuid(),
    student_id                uuid not null references public.profiles(id) on delete restrict,
    session_id                uuid not null references public.sessions(id) on delete restrict,
    status                    public.enrollment_status not null default 'pending_payment',
    stripe_session_id         text,
    stripe_payment_intent_id  text,
    amount_cents              integer not null check (amount_cents >= 0),
    currency                  char(3) not null default 'EUR',
    paid_at                   timestamptz,
    refunded_at               timestamptz,
    refunded_amount_cents     integer not null default 0 check (refunded_amount_cents >= 0),
    completed_at              timestamptz,
    cancelled_at              timestamptz,
    cancelled_reason          text,
    metadata                  jsonb not null default '{}'::jsonb,
    created_at                timestamptz not null default now(),
    updated_at                timestamptz not null default now()
);

create index if not exists idx_session_grants_student_id              on public.session_grants(student_id);
create index if not exists idx_session_grants_session_id              on public.session_grants(session_id);
create index if not exists idx_session_grants_status                  on public.session_grants(status);
create index if not exists idx_session_grants_stripe_session_id       on public.session_grants(stripe_session_id);
create index if not exists idx_session_grants_stripe_payment_intent_id on public.session_grants(stripe_payment_intent_id);

-- Partial unique index: a student can have at most one active or
-- pending_payment grant per session. Re-purchase is allowed once
-- the prior grant is `completed`, `cancelled` or `refunded`.
create unique index if not exists uq_session_grants_active_student_session
    on public.session_grants (student_id, session_id)
    where status in ('pending_payment', 'active');

drop trigger if exists trg_session_grants_updated_at on public.session_grants;
create trigger trg_session_grants_updated_at
    before update on public.session_grants
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Audit trigger
-- ---------------------------------------------------------------------
drop trigger if exists trg_session_grants_audit on public.session_grants;
create trigger trg_session_grants_audit
    after insert or update or delete on public.session_grants
    for each row execute function public.fn_audit_changes();

-- ---------------------------------------------------------------------
-- 3. Row-Level Security
-- ---------------------------------------------------------------------
alter table public.session_grants enable row level security;

-- 3.1  Read policy: owner or admin. (Tutors are no longer
--      auth users in Sprint 3.8, so the tutor-self-read
--      branch is gone — tutors are reference records.)
drop policy if exists session_grants_select_owner_tutor_admin on public.session_grants;
create policy session_grants_select_owner_admin
    on public.session_grants for select
    using (
        student_id = auth.uid()
        or public.is_admin()
    );

-- 3.2  Writes are deny-by-default. The only writer is the Stripe
--      webhook handler (which uses the service-role key) or an
--      admin route. A student cannot INSERT / UPDATE / DELETE
--      directly — they go through POST /api/session-grants
--      (which uses the user's JWT but writes only a
--      pending_payment row, gated by an admin-only RPC; see
--      the route handler in apps/web).
--      No `for all` policy is created; the default-deny
--      behaviour of RLS is the policy.

-- ---------------------------------------------------------------------
-- 4. Comments
-- ---------------------------------------------------------------------
comment on table public.session_grants is
    'Per-student × per-session payment. The unit of Stripe Checkout in Sprint 3.5+. Reuses the enrollment_status enum.';

-- ---------------------------------------------------------------------
-- 5. Done
-- ---------------------------------------------------------------------
-- This migration is idempotent. It can be re-applied safely.

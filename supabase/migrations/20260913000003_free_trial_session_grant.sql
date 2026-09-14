-- =====================================================================
-- Migration: 20260913000003_free_trial_session_grant.sql
-- Sprint:     Phase 1 — Feature A: First free 60-minute session.
--
-- Description
-- -----------
-- Adds the database-level gate that enforces "one free 60-minute
-- trial per student, globally". A free trial is a `session_grants`
-- row with `is_trial = true` and `amount_cents = 0`. The Stripe
-- charge is discounted 100% via the `COURSENLIGNE_FREE_TRIAL` coupon
-- (created on demand by the service layer).
--
-- Why a per-student global index, not a per-(student, session) index
-- ------------------------------------------------------------------
-- The existing partial unique index
-- `uq_session_grants_active_student_session` prevents a student from
-- having two open grants FOR THE SAME SESSION. It does NOT prevent
-- the student from starting a second trial on a DIFFERENT session.
-- Pricing Q6: "One 60-min trial per student, NOT per course/program/
-- subject. A student cannot stack trials by switching subjects."
-- That requires a *per-student* gate.
--
-- Race safety
-- -----------
-- The partial unique index below is the load-bearing race-safety
-- gate. Two parallel inserts of `is_trial = true` for the same
-- student both reach the index; only one wins. The losing caller
-- gets Postgres SQLSTATE 23505 (unique_violation) which the
-- service layer translates to a 409 `free_trial_already_used`
-- response.
--
-- Counting states
-- ---------------
-- The index covers `pending_payment`, `active`, and `completed`
-- statuses. A `cancelled` or `refunded` trial does NOT count —
-- the student can re-attempt. This matches the service-layer
-- `hasUsedFreeTrial` helper and lets an operator cancel an
-- accidental trial without locking the student out forever.
--
-- Idempotency
-- -----------
-- Every CREATE / ALTER / DROP is guarded with `if [not] exists`.
-- The migration is safe to re-apply.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. New column on `session_grants`
-- ---------------------------------------------------------------------
alter table public.session_grants
    add column if not exists is_trial boolean not null default false;

-- ---------------------------------------------------------------------
-- 2. Partial unique index: at most one open/completed trial per
--    student. This is the race-safety backstop.
-- ---------------------------------------------------------------------
drop index if exists public.uq_session_grants_one_trial_per_student;

create unique index if not exists uq_session_grants_one_trial_per_student
    on public.session_grants (student_id)
    where is_trial = true
      and status in ('pending_payment', 'active', 'completed');

-- ---------------------------------------------------------------------
-- 3. Lookup index for the dashboard "Have I used my trial?" check.
--    RLS still applies; the index is on the same column as the
--    partial unique above so the planner picks the right one.
-- ---------------------------------------------------------------------
create index if not exists idx_session_grants_student_is_trial
    on public.session_grants (student_id, is_trial)
    where is_trial = true;

-- ---------------------------------------------------------------------
-- 4. Documentation comment
-- ---------------------------------------------------------------------
comment on column public.session_grants.is_trial is
    'Pricing Q6: true for the one-time 60-minute free trial grant per student. Enforced globally by uq_session_grants_one_trial_per_student. amount_cents is always 0 for trial rows; the Stripe 100% discount coupon is applied at checkout time by the n8n enrollment-created workflow.';

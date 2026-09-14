-- =====================================================================
-- Migration: 20260913000003_free_trial_coupon_seed.sql
-- Sprint:     Phase 1 — Feature A: First free 60-minute session.
--             Coupon row bootstrap.
--
-- Description
-- -----------
-- Pre-creates the single canonical row in `public.coupons` that
-- powers the 100% off discount for the first free 60-minute
-- trial session (Pricing Q6). This row is read by the
-- Feature A service `getOrCreateFreeTrialCoupon()` and applied
-- to the Stripe Checkout Session by the n8n enrollment-created
-- workflow.
--
-- Why this migration lives in Feature A (not Feature B)
-- -----------------------------------------------------
-- `getOrCreateFreeTrialCoupon()` tries to INSERT the row itself
-- on a lookup miss. The existing `coupons_write_admin_only` RLS
-- policy blocks that INSERT for student-context callers, so on
-- a fresh database the first trial claim returns
-- 503 `coupon_unavailable`. A system-seeded row short-circuits
-- the lookup and lets the Feature A flow run without a
-- student-side privileged write path. The row is therefore a
-- Feature A prerequisite on a fresh local database.
--
-- Originally this seed lived inside Feature B's
-- `20260913000004_pack_refund_admin_oversight.sql`. It has been
-- moved here so Feature A can ship independently. The Feature B
-- migration retains the idempotent `WHERE NOT EXISTS` guard so
-- that, if a database applied Feature B first, re-applying
-- Feature A is a no-op and vice-versa.
--
-- Contract (locked — Pricing Q6)
-- ------------------------------
--   code             = 'COURSENLIGNE_FREE_TRIAL'
--   kind             = 'percent'
--   percent_off      = 100
--   currency         = 'EUR'
--   is_active        = true
--   max_redemptions  = null   (uncapped — per-student gating is
--                              enforced by the partial unique index
--                              `uq_session_grants_one_trial_per_student`
--                              on `session_grants.student_id`, not
--                              by this coupon)
--   redeemed_count   = 0
--   metadata         = { kind: 'free_trial',
--                        notes: 'Pricing Q6: one per student.
--                                Seeded by migration
--                                20260913000003_free_trial_coupon_seed.sql.' }
--
-- Idempotency
-- -----------
-- Guarded with `WHERE NOT EXISTS`. The migration is safe to
-- re-apply. The Feature B migration's matching seed uses the
-- same guard and the same code value, so two parallel seeds
-- converge on exactly one row.
-- =====================================================================

insert into public.coupons (
    code, kind, percent_off, currency, is_active,
    max_redemptions, redeemed_count, metadata
)
select
    'COURSENLIGNE_FREE_TRIAL',
    'percent'::public.coupon_kind,
    100,
    'EUR',
    true,
    null,
    0,
    jsonb_build_object(
        'kind', 'free_trial',
        'notes', 'Pricing Q6: one per student. Seeded by migration 20260913000003_free_trial_coupon_seed.sql.'
    )
where not exists (
    select 1 from public.coupons
    where code = 'COURSENLIGNE_FREE_TRIAL'
);
